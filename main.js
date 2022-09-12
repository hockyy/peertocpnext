const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const fs = require('fs')
const pty = require("node-pty");
const os = require("os");
const SHELL_PREFERENCE = {
  "win32": "cmd.exe", "linux": "bash", "darwin": "zsh"
}
const shell = SHELL_PREFERENCE[os.platform()] || "bash"
let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800, height: 600, webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    }
  })
  mainWindow.loadFile(path.join('renderer', 'index.html'))
}

let terminalWin;

const runFile = (compileResultfile) => {
  terminalWin = new BrowserWindow({
    width: 800, height: 400, webPreferences: {
      nodeIntegration: true, contextIsolation: false,
    }
  })
  terminalWin.loadFile(path.join('renderer', 'terminal.html'))
  const startTime = new Date()
  const ptyProcess = pty.spawn(compileResultfile, [], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: path.join(process.env.HOME, 'p2cp'),
    env: process.env
  });
  ptyProcess.onData(data => {
    terminalWin.webContents.send("terminal.incomingData", data);
  });
  ptyProcess.onExit(data => {
    if (!terminalWin.isDestroyed()) {
      terminalWin.webContents.send("terminal.incomingData",
          "\r\n")
      terminalWin.webContents.send("terminal.incomingData",
          `[Peer2CP: Exited with code ${data.exitCode}]\r\n`)
      terminalWin.webContents.send("terminal.incomingData",
          `[Peer2CP: Signal ${data.signal}]\r\n`)
      terminalWin.webContents.send("terminal.incomingData",
          `[Peer2CP: Finished Running in ${((new Date()) - startTime)
          / 1000}s]\r\n`)
    }
  })
  ipcMain.on("terminal.keystroke", (event, key) => {
    ptyProcess.write(key);
  });
  terminalWin.on("closed", (event) => {
    ptyProcess.kill()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
  ipcMain.on('add-terminal-window', (event, code) => {
    if (terminalWin != null && !terminalWin.isDestroyed()) {
      mainWindow.webContents.send("index.replaceCompileResult",
          "Close the current terminal to spawn another...\n")
      return;
    }
    const p2cpdir = path.join(process.env.HOME, 'p2cp')
    const codefile = path.join(p2cpdir, 'code.cpp')
    const compileResultfile = path.join(p2cpdir, 'code')
    if (!fs.existsSync(p2cpdir)) {
      fs.mkdir(p2cpdir, (err) => {
        if (err) {
          console.log(err)
        }
      });
    }
    fs.writeFile(codefile, code, err => {
      if (err) {
        console.log(err)
      }
    })
    mainWindow.webContents.send("index.replaceCompileResult", "Compiling...\n")
    const compileProcess = pty.spawn("g++", [codefile, "-o", compileResultfile],
        {})
    compileProcess.onData(data => {
      mainWindow.webContents.send("index.compileResult", data)
    })
    compileProcess.onExit(data => {
      mainWindow.webContents.send("index.compileResult",
          `Exited with code ${data.exitCode}`)
      if (data.exitCode === 0) {
        runFile(compileResultfile)
      }
    })

  })

})

app.on('window-all-closed', () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})