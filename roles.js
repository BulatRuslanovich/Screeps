const states = {
    HARVESTING: 'harvesting',
    WORKING: 'working'
};

const COLORS = {
    HARVEST: '#ffaa00',
    TRANSFER: '#ffffff',
    UPGRADE: '#00ff00',
    BUILD: '#a0a0ff',
    REPAIR: '#ff0000'
};

const PRIORITIES = {
    STRUCTURES: {
        [STRUCTURE_SPAWN]: 0,
        [STRUCTURE_EXTENSION]: 1,
        [STRUCTURE_TOWER]: 2
    }
};

module.exports = {
    runAll: function () {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];

            if (!creep.memory.role) continue;

            try {
                this.run(creep);
            } catch (e) {
                console.log(`Error in creep ${name}: ${e}`);
            }
        }
    },

    run: function (creep) {
        if (!creep.memory.state) {
            creep.memory.state = states.HARVESTING;
        }

        this.updateState(creep);

        switch (creep.memory.role) {
            case 'harvester':
                this.runHarvester(creep);
                break;
            case 'upgrader':
                this.runUpgrader(creep);
                break;
            case 'builder':
                this.runBuilder(creep);
                break;
            default:
                console.log(`Unknown role: ${creep.memory.role}`);
        }
    },

    updateState: function (creep) {
        const isEmpty = creep.store.getUsedCapacity() === 0;
        const isFull = creep.store.getFreeCapacity() === 0;

        if (creep.memory.state === states.HARVESTING && isFull) {
            creep.memory.state = states.WORKING;
            creep.say('⚡ go work');
            // Очищаем старые цели при смене состояния
            this.clearTargets(creep);
        } else if (creep.memory.state === states.WORKING && isEmpty) {
            creep.memory.state = states.HARVESTING;
            creep.say('🔄 need energy');
            this.clearTargets(creep);
        }
    },

    clearTargets: function (creep) {
        delete creep.memory.sourceId;
        delete creep.memory.targetId;
        delete creep.memory.workTargetId;
    },

    runHarvester: function (creep) {
        if (creep.memory.state === states.HARVESTING) {
            this.harvestEnergy(creep);
        } else {
            this.transferEnergy(creep);
        }
    },

    runUpgrader: function (creep) {
        if (creep.memory.state === states.HARVESTING) {
            this.harvestEnergy(creep);
        } else {
            this.upgradeController(creep);
        }
    },

    runBuilder: function (creep) {
        if (creep.memory.state === states.HARVESTING) {
            this.harvestEnergy(creep);
        } else {
            this.buildOrRepair(creep);
        }
    },

    harvestEnergy: function (creep) {
        let source = this.getValidSource(creep);

        if (!source) {
            source = this.findBestSource(creep);
            if (source) {
                creep.memory.sourceId = source.id;
            } else {
                return; 
            }
        }

        const harvestResult = creep.harvest(source);

        if (harvestResult === ERR_NOT_IN_RANGE) {
            this.moveToTarget(creep, source, COLORS.HARVEST, 10);
        } else if (harvestResult !== OK) {
            delete creep.memory.sourceId;
        }
    },

    getValidSource: function (creep) {
        if (!creep.memory.sourceId) return null;

        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            delete creep.memory.sourceId;
            return null;
        }
        return source;
    },

    findBestSource: function (creep) {
        const sources = creep.room.find(FIND_SOURCES_ACTIVE);
        if (sources.length === 0) return null;
        
        let bestSource = sources[0];
        let bestCreepCount = bestSource.pos.findInRange(FIND_MY_CREEPS, 2).length;
        let bestDistance = creep.pos.getRangeTo(bestSource);

        for (let i = 1; i < sources.length; i++) {
            const source = sources[i];
            const creepCount = source.pos.findInRange(FIND_MY_CREEPS, 2).length;
            const distance = creep.pos.getRangeTo(source);

            if (creepCount < bestCreepCount ||
                (creepCount === bestCreepCount && distance < bestDistance)) {
                bestSource = source;
                bestCreepCount = creepCount;
                bestDistance = distance;
            }
        }

        return bestSource;
    },

    transferEnergy: function (creep) {
        let target = this.getValidTransferTarget(creep);

        if (!target) {
            target = this.findBestTransferTarget(creep);
            if (target) {
                creep.memory.targetId = target.id;
            }
        }

        if (target) {
            const transferResult = creep.transfer(target, RESOURCE_ENERGY);

            if (transferResult === ERR_NOT_IN_RANGE) {
                this.moveToTarget(creep, target, COLORS.TRANSFER, 10);
            } else if (transferResult !== OK) {
                delete creep.memory.targetId;
            }
        } else {
            this.upgradeController(creep);
        }
    },

    getValidTransferTarget: function (creep) {
        if (!creep.memory.targetId) return null;

        const target = Game.getObjectById(creep.memory.targetId);
        if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            delete creep.memory.targetId;
            return null;
        }
        return target;
    },

    findBestTransferTarget: function (creep) {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN ||
                        structure.structureType === STRUCTURE_TOWER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        if (targets.length === 0) return null;

        // Сортируем по приоритету, затем по расстоянию
        let bestTarget = targets[0];
        let bestPriority = PRIORITIES.STRUCTURES[bestTarget.structureType] || 999;
        let bestDistance = creep.pos.getRangeTo(bestTarget);

        for (let i = 1; i < targets.length; i++) {
            const target = targets[i];
            const priority = PRIORITIES.STRUCTURES[target.structureType] || 999;
            const distance = creep.pos.getRangeTo(target);

            if (priority < bestPriority ||
                (priority === bestPriority && distance < bestDistance)) {
                bestTarget = target;
                bestPriority = priority;
                bestDistance = distance;
            }
        }

        return bestTarget;
    },

    upgradeController: function (creep) {
        if (!creep.room.controller) return;

        const upgradeResult = creep.upgradeController(creep.room.controller);

        if (upgradeResult === ERR_NOT_IN_RANGE) {
            this.moveToTarget(creep, creep.room.controller, COLORS.UPGRADE, 15, 3);
        }
    },

    buildOrRepair: function (creep) {
        let target = null;
        
        if (creep.memory.workTargetId !== null) {
            target = Game.getObjectById(creep.memory.workTargetId);

            if (!target) {
                creep.memory.workTargetId = null;
            }
        }

        if (!target) {
            target = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);


            // Если нет строительных площадок, ищем повреждённые структуры
            if (!target) {
                target = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return structure.hits < structure.hitsMax &&
                            structure.structureType !== STRUCTURE_WALL &&
                            structure.structureType !== STRUCTURE_RAMPART;
                    }
                });
            } else {
                creep.memory.workTargetId = target.id;
            }
        }

        if (target) {
            let result;
            if (target.progress !== undefined) { // Это строительная площадка
                result = creep.build(target);
            } else { // Это повреждённая структура
                result = creep.repair(target);
            }

            if (result === ERR_NOT_IN_RANGE) {
                this.moveToTarget(creep, target, COLORS.BUILD, 10);
            } else if (result === OK) {
                this.showWorkProgress(creep, target);
            }
        } else {
            this.upgradeController(creep);
        }
    },

    showWorkProgress: function (creep, target) {
        if (target.progress !== undefined) {
            const progress = Math.floor((target.progress / target.progressTotal) * 100);
            creep.say(`🔨${progress}%`);
        } else if (target.hits !== undefined) {
            const health = Math.floor((target.hits / target.hitsMax) * 100);
            creep.say(`🔧${health}%`);
        }
    },

    moveToTarget: function (creep, target, color, reusePath = 10, range = 1) {
        creep.moveTo(target, {
            visualizePathStyle: {stroke: color},
            reusePath: reusePath,
            range: range
        });
    }
};