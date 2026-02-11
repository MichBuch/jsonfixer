
try {
    const reactWindow = require('react-window');
    console.log('react-window exports:', Object.keys(reactWindow));
    console.log('react-window default:', reactWindow.default);
} catch (e) {
    console.error('react-window error:', e.message);
}

try {
    const autoSizer = require('react-virtualized-auto-sizer');
    console.log('auto-sizer exports keys:', Object.keys(autoSizer));
    console.log('auto-sizer type:', typeof autoSizer);
    console.log('auto-sizer default:', autoSizer.default);
} catch (e) {
    console.error('auto-sizer error:', e.message);
}
