/**
 * NAZAR Voice Engine English Command Alias Sheet
 * v1.0.0
 */
export const english = {
    locale: 'en-US',
    commands: {
        'navigate.home': ['open home', 'go home', 'go to home', 'show home', 'home page', 'home screen'],
        'navigate.camera': ['open camera', 'go to camera', 'camera mode', 'viewfinder', 'show camera'],
        'navigate.profile': ['open profile', 'go to profile', 'show profile', 'my profile', 'open account', 'profile page'],
        'navigate.settings': ['open settings', 'go to settings', 'show settings', 'settings page', 'open preferences', 'preferences'],
        'navigate.back': ['go back', 'back page', 'back', 'previous screen'],
        
        'ui.scrollDown': ['scroll down', 'go down', 'move down'],
        'ui.scrollUp': ['scroll up', 'go up', 'move up'],
        'ui.openMenu': ['open menu', 'show menu', 'menu list'],
        'ui.closeMenu': ['close menu', 'hide menu', 'exit menu'],
        'ui.openHistory': ['open history', 'show history', 'my scans', 'scan history'],
        'ui.openHelp': ['open help', 'show help', 'help center', 'how to use'],
        'ui.openAbout': ['open about', 'show about', 'about nazar', 'app info'],

        'camera.startScan': ['start scan', 'scan surroundings', 'analyze scene', 'describe scene', 'start scanning', 'scan now'],
        'camera.stopScan': ['stop scan', 'stop scanning', 'cancel scan', 'abort scan'],
        'camera.switch_ocr': ['switch to text mode', 'enable text mode', 'text mode', 'ocr mode', 'switch text mode', 'read text mode'],
        'camera.switch_scene': ['switch to scene mode', 'enable scene mode', 'scene mode', 'switch scene mode', 'describe mode'],
        'camera.captureImage': ['capture image', 'take photo', 'snap photo', 'capture photo'],
        'camera.readLastResult': ['read last result', 'read again', 'what was that', 'repeat scan result'],

        'speech.repeat': ['repeat', 'repeat description', 'repeat speech', 'say again'],
        'speech.stop': ['stop speaking', 'silence', 'stop speech', 'shut up', 'quiet'],
        'speech.pause': ['pause speaking', 'pause speech', 'pause'],
        'speech.continue': ['continue speaking', 'continue speech', 'continue', 'read more', 'continue reading'],

        'settings.increaseVolume': ['increase volume', 'volume up', 'louder', 'make louder'],
        'settings.decreaseVolume': ['decrease volume', 'volume down', 'softer', 'make quieter'],
        'settings.speak_faster': ['speak faster', 'faster speaking', 'speed up', 'talk faster'],
        'settings.speak_slower': ['speak slower', 'slower speaking', 'slow down', 'talk slower'],
        'settings.muteVoice': ['mute voice', 'mute speech', 'mute', 'silent mode'],
        'settings.unmuteVoice': ['unmute voice', 'unmute speech', 'unmute', 'sound on'],
        'settings.enableDarkMode': ['enable dark mode', 'dark mode on', 'turn on dark mode', 'activate dark theme'],
        'settings.disableDarkMode': ['disable dark mode', 'dark mode off', 'turn off dark mode', 'activate light theme'],

        'emergency.callContact': ['call emergency contact', 'call emergency', 'call helper', 'contact emergency'],
        'emergency.sendSOS': ['send sos', 'trigger emergency', 'send emergency alert', 'sos', 'emergency alert', 'help me'],
        'emergency.shareLocation': ['share location', 'send my location', 'where am i', 'current location'],
        'emergency.cancelSOS': ['cancel sos', 'cancel emergency', 'cancel alert', 'i am safe', 'im safe'],

        'ui.whatCanISay': ['what can i say', 'help instructions', 'show voice commands']
    }
};
