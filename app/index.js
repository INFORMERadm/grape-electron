// This is main process of Electron, started as first thing when your
// app starts. This script is running through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.

import {
  isNotificationSupported,
  isWindows,
  isOSX,
  isExternalUrl
} from './utils'

import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage
} from 'electron'

// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from './env'
import state from './state'
import storage from 'electron-json-storage'
import windowStateKeeper from './vendor/electron_boilerplate/window_state'
import showMainWindow from './showMainWindow'
import * as paths from './paths'
import * as menu from './menu'
import quit from './quit'
import close from './close'
import initTray from './initTray'
import setOpenLinksInDefaultBrowser from './setOpenLinksInDefaultBrowser'
import loadURL from './loadURL'
import handleOffline from './handleOffline'

// Preserver of the window size and position between app launches.
state.dimensions = windowStateKeeper('main', {
  width: 1075,
  height: 1000
})

const shouldQuit = app.makeSingleInstance(() => {
  const {mainWindow} = state
  // Someone tried to run a second instance, we should focus our window
  if (mainWindow) showMainWindow()
  return true
})

if (shouldQuit) quit()

app.on('ready', () => {
    // set global to be accessible from webpage
    global.isNotificationSupported = isNotificationSupported()

    const prefs = Object.assign(
      {},
      state.dimensions,
      {
        webPreferences: {
          allowDisplayingInsecureContent: true
        }
      }
    )
    state.mainWindow = new BrowserWindow(prefs)
    const {webContents} = state.mainWindow

    state.mainWindow.on('close', close)

    state.mainWindow.on('hide', () => {
      state.mainWindow.blurWebView()
    })

    if (state.dimensions.isMaximized) {
      state.mainWindow.maximize()
    }

    if (env.name === 'test') {
      state.mainWindow.loadURL(`file://${__dirname}/spec.html`)
    } else {
      storage.get('lastUrl', (error, data) => {
        let url = env.host
        if (
          !error &&
          data &&
          data.url &&
          !isExternalUrl(data.url, url)
        ) url = data.url
        loadURL(url)
      })
    }

    if (env.name !== 'production') state.mainWindow.openDevTools()

    const Menu = state.Menu = require('menu')
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu.main))

    initTray()
    setOpenLinksInDefaultBrowser()
    webContents.on('will-navigate', handleOffline.bind(null, undefined))

})

app.on('window-all-closed', () => {})
app.on('before-quit', () => {
  state.dontPreventClose = true
})

app.on('certificate-error', (e, webContents, url, error, certificate, callback) => {
    if (url.indexOf('staging.chatgrape.com') > -1) {
      e.preventDefault()
      callback(true)
    } else {
      callback(false)
    }
})

app.on('platform-theme-changed', () => {
  if (!isOSX()) return
  let icon = paths[app.isDarkMode() ? 'trayWhiteIcon' : 'trayIcon']
  state.trayIcon.setImage(icon)
})

ipcMain.on('addBadge', (e, badge) => {
  if (isWindows()) {
    state.mainWindow.setOverlayIcon(
      paths.statusBarOverlay,
      (badge + ' unread channel' + (parseInt(badge) > 1 ? 's' : ''))
    )
  } else {
    state.trayIcon.setImage(paths.trayBlueIcon)
    if (app.dock) app.dock.setBadge(String(badge))
  }
})

ipcMain.on('removeBadge', () => {
  const {trayIcon, mainWindow} = state
  if (isWindows()) {
    mainWindow.setOverlayIcon(nativeImage.createEmpty(), '')
  } else {
    let icon = paths[app.isDarkMode() ? 'trayWhiteIcon' : 'trayIcon']
    trayIcon.setImage(icon)
    if (app.dock) app.dock.setBadge('')
  }
})

ipcMain.on('showNotification', (e, notification) => {
  const {trayIcon} = state
  trayIcon.displayBalloon({
    icon: paths.icon,
    title: notification.title,
    content: notification.message
  })
  trayIcon.once('balloon-click', () => {
    e.sender.send(String(notification.event))
  })
})

ipcMain.on('loadChat', (e, notification) => {
  loadURL(env.host)
})