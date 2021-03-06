/* 
 * Copyright 2017 Albert Santos.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define(['lbutil', 'lbmath', 'lbgeometry', 'lbphysics', 'lbfoils', 'lbsailsimbase', 'lbassets', 'lbforces', 'lbvessel', 'lbwind', 'lbwater', 'lbboundaries'], 
function(LBUtil, LBMath, LBGeometry, LBPhysics, LBFoils, LBSailSim, LBAssets, LBForces) {
    
    'use strict';


/**
 * The main sailing environment, basically the sailing world.
 * @class SailEnv
 * @param {module:LBAssets.Loader} [assetLoader]   The optional asset loader.
 * @constructor
 * @returns {LBSailSim.Env}
 */
LBSailSim.Env = function(assetLoader) {
    this.assetLoader = assetLoader || new LBAssets.Loader();
    
    this.boundaries = new LBSailSim.Boundaries();
    this.wind = new LBSailSim.Wind(this);
    this.water = new LBSailSim.Water(this);
    
    this.clCdCurves = [];

    /**
     * The boat data objects, each property is named with the boat type name, with the
     * value of the property the data object for that boat type.
     * @readonly
     * @member {object}
     */
    this.boatDatas = {};
    
    /**
     * Each property of boatsByType has the name of the boat type and is an object
     * whose properties correspond to the possible instances of the boat type. These
     * properties have the name of the boat instance and a value that is an object containing
     * two optional properties:
     * <pre><code>
     *  instanceData:   {},     // Optional instance specific data from the JSON file.
     *  boatInstance:   null    // The boat instance, null if the boat has not been checked out.
     * </code></pre>
     * @readonly
     * @member {object}
     */
    this.boatsByType = {};
    
    /**
     * The acceleration due to gravity.
     * @member {Number}
     */
    this.gravity = 9.81;
    
    /**
     * The maximum distance we can see (i.e. the camera clipping should be beyond this.)
     * @member {Number}
     */
    this.horizonDistance = 32000;
    
    /**
     * The number of points to record in vessel trajectories. Default is 600, which is
     * 10 seconds worth of data at 1/60 second dt.
     * @member {Number}
     */
    this.trajectoryPointsToRecord = 600;
    
    /**
     * Array of callback objects. These callback objects are examimed for
     * the appropriate functions, and if present that function is called at the
     * appropriate time.
     * @member {Array}
     */
    this.callbacks = [];
    
    /**
     * The main simulation time.
     * @member {Number}
     */
    this.currentTime = 0;
    
    
    this.loadCoordinator = new LBAssets.MultiLoadCoordinator();
    
    this.buoyancyGenerator = new LBForces.Buoyancy({
        gravity: this.gravity,
        applyGravity: true,
        fluidZ: 0
    });
    
    this.dampingGenerator = new LBForces.Damping({
        defaultDamping: 0.1
    });
    
    this.objectDefs = {};
    this.floatingObjects = [];
    this.floatingObjectsByClassification = {};
};

LBSailSim.Env.prototype = {
    constructor: LBSailSim.Env,
    
    /**
     * Calculates the Froude number for a given speed and length.
     * @param {Number} vel  The speed.
     * @param {Number} len  The length.
     * @returns {Number}    The Froude number.
     */
    calcFroudeNumber: function(vel, len) {
        return vel / Math.sqrt(len * this.gravity);
    },
    
    /**
     * Calculates the Reynolds number for a given speed and length in the air.
     * @param {Number} vel  The speed.
     * @param {Number} len  The length.
     * @returns {Number}    The Reynolds number.
     */
    calcAirRe: function(vel, len) {
        return this.wind.calcRe(vel, len);
    },
    
    /**
     * Calculates the Reynolds number for a given speed and length in the water.
     * @param {Number} vel  The speed.
     * @param {Number} len  The length.
     * @returns {Number}    The Reynolds number.
     */
    calcWaterRe: function(vel, len) {
        return this.water.calcRe(vel, len);
    },
    
    
    /**
     * Resets the environment to be empty. {@link LBSailSim.SailEnv#loadEnv} will have to
     * be called again.
     */
    clearEnv: function() {
        this.returnAllBoats();
        
        this.clCdCurves.length = 0;
        this.boatDatas = {};
        this.boatsByType = {};
        
        // TODO:
        // We need to remove the various objects from the physics link...
        
        this.objectDefs = {};
        this.floatingObjects.length = 0;
        this.floatingObjectsByClassification = {};
    },
    
    /**
     * Loads the environment from a JSON data file. The loading is asynchronous.
     * @param {String} name The plain name of the data file, it should not have a path nor
     * an extension. The file must be located in the data/env/ folder.
     * @param {Function} [onLoaded] Optional function called when loading is complete.
     * @param {Function} [onError] Optional function called on load failures.
     */
    loadEnv: function(name, onLoaded, onError) {
        var me = this;
        this.name = name;
        var fileName = 'data/env/' + name + '.json';
        this.assetLoader.loadJSON(name, fileName, function(data) {
            data = LBAssets.expandIncludes(data);
            me._loadEnvFromData(data, onLoaded, onError);
        });
    },
    
    _loadEnvFromData: function(data, onLoaded, onError) {
        var me = this;

        this.trajectoryPointsToRecord = data.trajectoryPointsToRecord || this.trajectoryPointsToRecord;
        
        this.loadCoordinator.setup(onLoaded, onError);
        this.loadCoordinator.beginLoadCalls();
            
        this.assetLoader.loadJSON(data.boatList, data.boatList, 
            this.loadCoordinator.getOnLoadFunction(function(data) {
                data = LBAssets.expandIncludes(data);
                me.loadBoatDatas(data);
            }),
            this.loadCoordinator.getOnProgressFunction(),
            this.loadCoordinator.getOnErrorFunction());
                
        this.assetLoader.loadJSON(data.clCdCurves, data.clCdCurves, 
            this.loadCoordinator.getOnLoadFunction(function(data) {
                me.loadClCdCurves(data);
            }),
            this.loadCoordinator.getOnProgressFunction(),
            this.loadCoordinator.getOnErrorFunction());
        
        if (data.objectDefs) {
            data.objectDefs.forEach(this._loadObjectDef, this);
        }

        if (data.boundaries) {
            this._loadBoundaries(data.boundaries);
        }
        
        if (data.floating) {
            this._loadFloating(data.floating);
        }
    // Need to load the environment JSON file.
    // When the file is loaded, need to install the scenery.
    // The environment consists of:
    // a) Objects (buoys, floating docks, flotsam)
    //      Coordinates, 3D model, Volumes, constraints, additional properties (dock, ???)
    // b) Boats available for checkout.
    // c) clcdcurves.json
    // d) Shallows?
    // e) Current map?
    // f) 
    
        this.loadCoordinator.endLoadCalls();
    },
    
    _loadBoundaries: function(data) {
        this.boundaries = LBSailSim.Boundaries.createFromData(this, data);
    },
    
    _loadFloating: function(data) {
        if (data.objects) {
            this.posNameToLoad = data.posNameToLoad || 'pos';
            data.objects.forEach(this.loadFloatingObject, this);
        }
    },
    
    _loadObjectDef: function(data) {
        this.objectDefs[data.name] = data;
    },
    
    loadFloatingObject: function(data) {
        if (data.ignore) {
            return;
        }
        
        // Get the object definition and load the object from it.
        if (!data.def) {
            console.error("Could not load the floating object '" + data.name + "', data.def was not defined.");
            return;
        }
        
        var objectDef = this.objectDefs[data.def];
        if (!objectDef) {
            console.error("Could not load the floating object '" + data.name + "', the data definition '" + data.def + "' was not defined.");
            return;
        }
        
        var rigidBody = LBPhysics.RigidBody.createFromData(objectDef);        
        this.floatingObjects.push(rigidBody);
        rigidBody.name = data.name;
        
        LBForces.Buoyancy.loadRigidBodySettings(rigidBody, objectDef);
        
        var posData = data[this.posNameToLoad] || data.pos;
        if (posData) {
            LBGeometry.loadVector3(posData, rigidBody.obj3D.position);
        }
        
        rigidBody.obj3D.updateMatrixWorld(true);
        rigidBody.classification = data.classification || "";
        
        var classifiedObjects = this.floatingObjectsByClassification[rigidBody.classification];
        if (!classifiedObjects) {
            classifiedObjects = [];
            this.floatingObjectsByClassification[rigidBody.classification] = classifiedObjects;
        }
        classifiedObjects.push(rigidBody);
        
        // TODO: Handle the type.
        this.floatingObjectLoaded(data, rigidBody, objectDef);
    },
    
    /**
     * Called when a floating object has been loaded to provide optional further proessing.
     * @param {Object} data The data object used to load the floating object.
     * @param {module:LBPhysics.RigidBody} rigidBody   The rigid body floating object.
     * @param {Object} objectDef    The definition object.
     */
    floatingObjectLoaded: function(data, rigidBody, objectDef) {
        if (this.physicsLink) {
            var constraint = data.constraint || 'fixed';
            switch (constraint) {
                case 'fixed' :
                default :
                    this._addFixedFloatingObject(rigidBody, data, objectDef);
                    break;

                case 'chain' :
                    this._addChainedFloatingObject(rigidBody, data, objectDef);
                    break;
            }
        }
    },
    
    _addFixedFloatingObject: function(rigidBody, data, objectDef) {
        this.physicsLink.addFixedObject(rigidBody);
    },
    
    _addChainedFloatingObject: function(rigidBody, data, objectDef) {
        this.physicsLink.addRigidBody(rigidBody, data);
        this.buoyancyGenerator.addRigidBody(rigidBody);
        
        if (data.chain) {
            var length = data.chain.length || 10;
            var depth = data.chain.depth || length * 0.75;
            if (depth > length) {
                depth = length;
            }
            var springConstant = data.chain.springConstant || 1;
            
            var minSpringLength = length;
            var anchorPos = new LBGeometry.Vector3();
            rigidBody.obj3D.localToWorld(anchorPos);
            anchorPos.z = -depth;
            
            var spring = new LBForces.Spring(
                    rigidBody,
                    anchorPos,
                    {
                        minForceLength: minSpringLength,
                        springConstant: springConstant
                    });
            this.physicsLink.addForceGenerator(spring);
            
            if (!rigidBody.linearDamping) {
                this.dampingGenerator.addRigidBody(rigidBody);
            }
        }
    },
    
    
    /**
     * Retrieves the floating object with a given name.
     * @param {String} name The name of the desired object.
     * @returns {module:LBPhysics.RigidBody} The floating object with the name, undefined if none found.
     */
    getFloatingObject: function(name) {
        var length = this.floatingObjects.length;
        for (var i = 0; i < length; ++i) {
            if (this.floatingObjects[i].name === name) {
                return this.floatingObjects[i];
            }
        }
        return undefined;
    },

    //
    // Floating object scenario:
    // ObjectDefs are used to create the actual object instances.
    // From an ObjectDef, we create an LBPhysics.RigidBody object.
    // The ObjectDef is just the data definition.
    // For a floating object, we have the reference to the object def,
    // So on loading the floating object, we do the following:
    //      Obtain the ObjectDef.
    //      Create the RigidBody object from the object def.
    //      [ThreeJS] From the object def data, also load the 3D JSON Model via Scene3D.
    //          Async, so callback will associate the model with the rigid body.
    //          Model is added to the scene via Scene3D.
    //      [Phaser] From the object def data, also load the Phaser sprite.
    //      Add the rigid body object to the physics link.
    //
    
    /**
     * Loads {@link module:LBFoils.ClCdCurve} from a data object.
     * @param {object} data The array of data objects for the ClCd curves.
     * @returns {LBSailSim.Env} this.
     */
    loadClCdCurves: function(data) {
        data.clCdCurves.forEach(this._loadClCdCurve, this);
        return this;
    },
    
    _loadClCdCurve: function(data) {
        var clCdCurve = new LBFoils.ClCdCurve();
        clCdCurve.load(data);
        this.clCdCurves[clCdCurve.name] = clCdCurve;
    },
    
    
    /**
     * Retrieves a loaded {@link module:LBFoils.ClCdCurve}.
     * @param {object} name The name of the ClCd curve.
     * @returns {object}    The ClCd curve, undefined if there isn't one with the name.
     */
    getClCdCurve: function(name) {
        return this.clCdCurves[name];
    },
    
    
    /**
     * Adds a callback object.
     * @param {Object} callback The callback object.
     * @returns {LBSailSim.Env} this.
     */
    addCallback: function(callback) {
        this.callbacks.push(callback);
        return this;
    },
    
    /**
     * Removes a callback object.
     * @param {Object} callback The callback object to remove.
     * @returns {LBSailSim.Env} this.
     */
    removeCallback: function(callback) {
        var index = this.callbacks.indexOf(callback);
        if (index >= 0) {
            this.callbacks.splice(index, 1);
        }
        return this;
    },

    /**
     * Loads the boat data objects, actual boat instances are not created.
     * @param {object} data An array containing the boat data objects.
     * @returns {LBSailSim.Env} this.
     */
    loadBoatDatas: function(data) {
        data.boats.forEach(this._loadBoatData, this);
        return this;
    },
    
    /**
     * Called from {@link LBSailSim.SailEnv.loadBoatDatas} to handle storing the data
     * object and updating the boat database.
     * @protected
     * @param {object} data The boat data object.
     * @returns {undefined}
     */
    _loadBoatData: function(data) {
        this.boatDatas[data.typeName] = data;
        
        var boatsForType = {};
        if (data.instances) {
            // TODO: Someday support a range of numbered boats.
            for (var i = 0; i < data.instances.length; ++i) {
                boatsForType[data.instances[i].name] = {
                    instanceData: data.instances[i],
                    boatInstance: null
                };
            }
        }
        else {
            boatsForType[data.typeName] = {
                boatInstance: null
            };
        }
        this.boatsByType[data.typeName] = boatsForType;
    },
    
    /**
     * Retrieves the boat data object for a particular boat type.
     * @param {object} typeName The boat type name.
     * @returns {LBSailSim.Env.boatDatas}
     */
    getBoatData: function(typeName) {
        return this.boatDatas[typeName];
    },
    
    /**
     * Determines if a boat is available for checkout.
     * @param {object} typeName The name of the boat type.
     * @param {object} [boatName] The name of the boat instance, if undefined the typeName is used.
     * @returns {Boolean}   True if the boat is available for checkout.
     */
    isBoatAvailable: function(typeName, boatName) {
        var boatData = this.getBoatData(typeName);
        if (!boatData) {
            return false;
        }

        var boatsOfType = this.boatsByType[typeName];
        if (!boatsOfType) {
            // The boat type is not supported.
            return false;
        }

        boatName = boatName || typeName;
        var boatEntry = boatsOfType[boatName];
        if (!boatEntry) {
            // Boat name not supported for the type.
            return false;
        }
        
        return boatEntry.boatInstance === null;
    },
    

    /**
     * Creates and loads a new boat instance. The boat is attached to the sailing environment.
     * <p>
     * This will call the function:
     * <p>
     * onBoatCheckedOut = function(boat, data) {}
     * <p>
     * on any callbacks that have it defined.
     * 
     * @param {object} typeName The boat's type.
     * @param {object} [boatName] The name of the particular boat instance.
     * @param {Number} [centerX=0] The initial x coordinate of the boat.
     * @param {Number} [centerY=0] The initial y coordinate of the boat.
     * @param {Number} [rotDeg=0] The initial rotation of the boat, in degrees.
     * @param {Number} [rollDeg=0] The initial roll angle of the boat, in degrees.
     * @param {Number} [pitchDeg=0] The initial pitch angel of the boat, in degrees.
     * @returns {object}    The boat instance, undefined if the boat is not available.
     */
    checkoutBoat: function(typeName, boatName, centerX, centerY, rotDeg, rollDeg, pitchDeg) {
        if (!this.isBoatAvailable(typeName, boatName)) {
            return undefined;
        }

        var boatData = this.getBoatData(typeName);
        if (!boatData) {
            return undefined;
        }

        boatName = boatName || "";
        var boat = this._createBoatInstance(typeName, boatName, boatData);
        if (!boat) {
            return undefined;
        }

        var boatsOfType = this.boatsByType[typeName];
        var boatEntry = boatsOfType[boatName];
        boatEntry.boatInstance = boat;
        
        boat.name = boatName;
        boat.boatInstanceData = boatEntry.instanceData;
        
        boat.obj3D.position.x = centerX || 0;
        boat.obj3D.position.y = centerY || 0;
        rollDeg = rollDeg || 0;
        pitchDeg = pitchDeg || 0;
        rotDeg = rotDeg || 0;
        boat.obj3D.rotation.set(rollDeg * LBMath.DEG_TO_RAD, pitchDeg * LBMath.DEG_TO_RAD, rotDeg * LBMath.DEG_TO_RAD, 'ZYX');
        boat.obj3D.updateMatrixWorld(true);

        this._boatCheckedOut(boat, boatData);
        return boat;
    },
    
    /**
     * Called by {@link LBSailSim.Env.checkoutBoat} to handle creating the actual
     * boat instance. This also loads the boat from the data.
     * @protected
     * @param {object} typeName The boat's type name passed to checkoutBoat().
     * @param {object} boatName The instance name for the boat.
     * @param {object} data The boat data object.
     * @param {object} [loadCallback]   If defined, a callback object with functions that
     * get called back after each component is loaded.
     * @returns {object}    The boat instance.
     */
    _createBoatInstance: function(typeName, boatName, data, loadCallback) {
        var boat = LBSailSim.Vessel.createFromData(data, this, loadCallback);
        boat.boatName = boatName;
        return boat;
    },
    
    /**
     * Called by {@link LBSailSim.Env#checkoutBoat} when a boat has been checked out, lets derived
     * objects update their state.
     * @protected
     * @param {object} boat The boat that was checked out.
     * @param {Object} data The data object that was passed to {@link LBSailSim.Env#checkoutBoat}.
     */
    _boatCheckedOut: function(boat, data) {
        this.callbacks.forEach(
            function(callback) {
                if (callback.onBoatCheckedOut) {
                    callback.onBoatCheckedOut(boat, data);
                }
            },
            this);
    },

    /**
     * Returns a boat that had been checked out.
     * @param {object} boat The boat to return.
     * @returns {Boolean}   True if the boat was returned, false if it had not
     * been checked out.
     */
    returnBoat: function(boat) {
        var boatsOfType = this.boatsByType[boat.typeName];
        if (boatsOfType) {
            var boatEntry = boatsOfType[boat.boatName];
            if (boatEntry && (boatEntry.boatInstance === boat)) {
                boatEntry.boatInstance = null;
                this._boatReturned(boat);
                boat.destroy();
                return true;
            }
        }

        return false;
    },

    /**
     * Called by {@link LBSailSim.Env.returnBoat} when a boat has been returned, lets derived
     * objects update their state.
     * <p>
     * This will call the function:
     * <p>
     * onBoatReturned = function(boat) {}
     * <p>
     * for any callbacks that define it.
     * @protected
     * @param {object} boat The boat that was returned.
     */
    _boatReturned: function(boat) {
        this.callbacks.forEach(
            function(callback) {
                if (callback.onBoatReturned) {
                    callback.onBoatReturned(boat);
                }
            },
            this);
    },
    
    /**
     * Returns all the boats that have been checked out.
     * @return {LBSailSim.SailEnv} this.
     */
    returnAllBoats: function() {
        var me = this;
        Object.values(this.boatsByType).forEach(function(boatsOfType) {
           Object.values(boatsOfType).forEach(function(boatEntry) {
               me.returnBoat(boatEntry.boatInstance);
           });
        });
        
        return this;
    },
    
    /**
     * Sets the vessel that has focus, this is where if needed the simulation focuses
     * its resources.
     * @param {LBSailSim.Vessel} vessel   The vessel to set as the focus boat, may be undefined/null.
     */
    setFocusVessel: function(vessel) {
        if (this.focusVessel !== vessel) {
            this.focusVessel = vessel;
            this.callbacks.forEach(
                    function(callback) {
                        if (callback.onSetFocusVessel) {
                            callback.onSetFocusVessel(vessel);
                        }
                    },
                this);
        }
    },
    
    /**
     * 
     * @returns {LBSailSim.Vessel}  The vessel that currently is the focus of the simulation, may be undefined or null.
     */
    getFocusVessel: function() {
        return this.focusVessel;
    },
    
    /**
     * Call after physics have been updated to handle any pre-rendering updates.
     * @returns {object} this.
     */
    preRender: function() {
        
    },

    /**
     * Call to update the sailing environment state for a new simulation time step.
     * @param {Number} dt   The simulation time step.
     * @returns {object}    this.
     */
    update: function(dt) {
        this.boundaries.update(dt);
        this.wind.update(dt);
        this.water.update(dt);
        
        this.currentTime += dt;
        return this;
    }
};


/**
 * Helper that retreives the flow velocity for a given position.
 * @param {object} flow The flow object, such as {@link LBSailEnv.Wind} or {@link LBSailEnv.Water}.
 * @param {object} pos  The coordinates of the position of interest.
 * @param {object} [vel]  If defined the object to receive the velocity.
 * @returns {object}    The flow velocity.
 */
LBSailSim.getFlowVelocity = function(flow, pos, vel) {
    var z = pos.z || 0;
    return flow.getFlowVelocity(pos.x, pos.y, z, vel);
};

return LBSailSim;
});
