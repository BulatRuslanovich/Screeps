const roles = require('roles');
const spawnManager = require('spawnManager');
const memoryManager = require('memoryManager');

module.exports.loop = function () {
    try {
        memoryManager.clean();
        spawnManager.run();
        roles.runAll();
    } catch (e) {
        console.log('Main loop error: ' + e.message);
    }
};

