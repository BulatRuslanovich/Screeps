module.exports = {
    clean: function() {
        for (const name in Memory.creeps) {
            if (!Game.creeps[name]) {
                console.log('Clearing memory of dead creep: ' + name);
                delete Memory.creeps[name];
            }
        }
    }
};