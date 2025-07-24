// module.exports = {
//     run: function() {
//         const spawn = Game.spawns['Main'];
//         if (!spawn || spawn.spawning) return;

//         const creeps = _.groupBy(Game.creeps, c => c.memory.role);
//         const energy = spawn.room.energyAvailable;

//         const priorities = this.getSpawnPriorities(spawn.room);
        
//         if (energy < 300) {
//             return;
//         }

//         for (const priority of priorities) {
//             const current = creeps[priority.role] ? creeps[priority.role].length : 0;

//             if (current < priority.min) {
//                 this.spawnCreep(spawn, priority.role, energy);
//                 return;
//             } else {
//                 this.spawnCreep(spawn, 'builder', energy);
//             }
//         }
//     },

//     getSpawnPriorities: function(room) {
//         const constructionSites = room.find(FIND_CONSTRUCTION_SITES).length;

//         return [
//             { role: 'harvester', min: 10 },
//             { role: 'upgrader', min: 1 },
//             { role: 'builder', min: constructionSites > 0 ? 1 : 0 }
//         ];
//     },

//     spawnCreep: function(spawn, role, energyAvailable) {
//         const body = this.getOptimalBody(role, energyAvailable);
//         const newName = `${role}-${Game.time}`;

//         const result = spawn.spawnCreep(body, newName, {
//             memory: { role: role }
//         });

//         if (result === OK) {
//             console.log(`Spawning new ${role}: ${newName}`);
//         }

//         return result;
//     },

//     getOptimalBody: function(role, energyAvailable) {
//         if (energyAvailable < 300) {
//             return [WORK, CARRY, MOVE];
//         } else if (energyAvailable < 550) {
//             switch(role) {
//                 case 'harvester':
//                     return [WORK, WORK, CARRY, MOVE];
//                 case 'builder':
//                     return [WORK, CARRY, CARRY, MOVE, MOVE];
//                 default:
//                     return [WORK, CARRY, MOVE, MOVE];
//             }
//         } else {
//             switch(role) {
//                 case 'harvester':
//                     return [WORK, WORK, WORK, CARRY, MOVE];
//                 case 'builder':
//                     return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
//                 case 'upgrader':
//                     return [WORK, WORK, WORK, CARRY, MOVE];
//                 default:
//                     return [WORK, CARRY, MOVE];
//             }
//         }
//     }
    
// };



module.exports = {
    run: function() {
        const spawn = Game.spawns['Main'];
        if (!spawn || spawn.spawning) return;
        
        const room = spawn.room;
        const creeps = _.groupBy(Game.creeps, c => c.memory.role);
       
        const energy = Math.min(room.energyAvailable, room.energyCapacityAvailable);
        
        // Рассчитываем потребности комнаты
        const needs = {
            harvester: this.calculateHarvesterNeed(room, creeps),
            builder: this.calculateBuilderNeed(room, creeps),
            upgrader: this.calculateUpgraderNeed(room, creeps)
        };
        
        // Определяем приоритет спавна
        const roleToSpawn = this.getHighestPriorityRole(needs, energy);
        
        if (roleToSpawn) {
            this.spawnCreep(spawn, roleToSpawn, energy);
        }
    },

    calculateHarvesterNeed: function(room, creeps) {
        const harvesters = creeps.harvester || [];
        const current = harvesters.length;
        
        // Критические условия
        if (current === 0) return { priority: 100, min: 1 };
        if (room.energyAvailable < 500 && current < 2) return { priority: 80, min: 2 };
        
        // Нормальные условия
        const sources = room.find(FIND_SOURCES).length;
        const energyShortage = room.energyAvailable < 1000;
        
        const optimal = Math.min(sources * 3, 6);
        const deficit = optimal - current;
        
        return {
            priority: energyShortage ? 70 : 50,
            min: deficit > 0 ? Math.max(2, optimal) : 0
        };
    },

    calculateBuilderNeed: function(room, creeps) {
        const builders = creeps.builder || [];
        const current = builders.length;
        const sites = room.find(FIND_CONSTRUCTION_SITES).length;
        
        // Критические условия
        if (sites > 5 && current === 0) return { priority: 90, min: 1 };
        
        // Нормальные условия
        const damaged = room.find(FIND_STRUCTURES, {
            filter: s => s.hits < s.hitsMax * 0.8 && 
                       s.structureType !== STRUCTURE_WALL &&
                       s.structureType !== STRUCTURE_RAMPART
        }).length;
        
        const workNeeded = sites + damaged;
        const priority = workNeeded > 3 ? 65 : 40;
        const min = workNeeded > 0 ? Math.min(3, Math.ceil(workNeeded / 2)) : 0;
        
        return { priority, min };
    },

    calculateUpgraderNeed: function(room, creeps) {
        const upgraders = creeps.upgrader || [];
        const current = upgraders.length;
        const controller = room.controller;
        
        // Критические условия
        if (controller.ticksToDowngrade < 2000) return { priority: 95, min: 2 };
        
        // Нормальные условия
        const progressRatio = controller.progress / controller.progressTotal;
        const priority = progressRatio > 0.8 ? 60 : 30;
        
        // Оптимальное количество в зависимости от уровня комнаты
        const optimal = Math.min(controller.level, 4);
        const deficit = optimal - current;
        
        return {
            priority,
            min: deficit > 0 ? Math.max(1, optimal) : 0
        };
    },

    getHighestPriorityRole: function(needs, energy) {
        // Фильтруем роли, где требуется создать крипа
        const candidates = [];
        for (const role in needs) {
            const need = needs[role];
            const current = _.filter(Game.creeps, c => c.memory.role === role).length;
            if (current < need.min) {
                candidates.push({
                    role: role,
                    priority: need.priority
                });
            }
        }
        
        if (candidates.length === 0) return null;
        
        // Выбираем роль с наивысшим приоритетом
        candidates.sort((a, b) => b.priority - a.priority);
        return candidates[0].role;
    },

    spawnCreep: function(spawn, role, energyAvailable) {
        if (energyAvailable < 250) {
            return null;
        }
        
        const body = this.getOptimalBody(role, energyAvailable);
        const newName = `${role}-${Game.time}`;

        const result = spawn.spawnCreep(body, newName, {
            memory: { role: role }
        });

        if (result === OK) {
            const bodyCodes = body.map(p => p.charAt(0)).join('');
            console.log(`Spawning new ${role}: ${newName} with ${bodyCodes}`);
        } else {
            console.log(`Failed to spawn ${role}: ${result}`);
        }

        return result;
    },

    getOptimalBody: function(role, energyAvailable) {
        // Базовый набор для всех ролей
        const base = [WORK, CARRY, MOVE];
        let body = [];
        let cost = 0;
        
        // Добавляем базовые части пока хватает энергии
        while (cost + 200 <= energyAvailable) {
            body = body.concat(base);
            cost += 200;
        }
        
        // Улучшаем в зависимости от роли
        if (role === 'harvester') {
            // Максимальное количество WORK частей
            while (cost + 100 <= energyAvailable) {
                body.push(WORK);
                cost += 100;
            }
        }
        else if (role === 'builder') {
            // Увеличиваем грузоподъемность
            while (cost + 50 <= energyAvailable) {
                body.push(CARRY);
                cost += 50;
            }
        }
        else if (role === 'upgrader') {
            // Баланс WORK и CARRY
            while (cost + 100 <= energyAvailable) {
                body.push(WORK);
                cost += 100;
            }
        }
        
        // Балансируем передвижение
        const workParts = body.filter(p => p === WORK).length;
        const carryParts = body.filter(p => p === CARRY).length;
        const totalWeight = workParts * 2 + carryParts;
        const neededMoves = Math.ceil(totalWeight / 2);
        const currentMoves = body.filter(p => p === MOVE).length;
        
        if (currentMoves < neededMoves) {
            const movesToAdd = neededMoves - currentMoves;
            for (let i = 0; i < movesToAdd; i++) {
                if (cost + 50 <= energyAvailable) {
                    body.push(MOVE);
                    cost += 50;
                }
            }
        }
        
        return body;
    }
};