/* 
 * Copyright 2018 Albert Santos.
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


/* global L, Tangram, Symbol, fetch, Promise, mbtaHeaders */

var myApp = 
(function() {
    'use strict';

//
// TODO:
// Option to select inbound/outbound/both. 
//
// Settings:
//      - Display buildings.
//      - Display routes.
//      - Display stops.
//      - Display stations.
//      - Display vehicles.
//      - Estimate vehicle positions.
//      
//      - Save/restore the state for these settings.
//      
// Need to consolidate stops that are almost on top of each other so we can see
// predictions for both directions.
//
//
// Need to use route name for route menus.

var map = L.map('map');


var tLayers = setupTLayers(map);
    
var shapes = tLayers.shapes;
var stops = tLayers.stops;
var trips = tLayers.trips;
var vehicles = tLayers.vehicles;
var routes = tLayers.routes;

var storage = window.localStorage;
var tLayersStorageKey = 'tLayers';

const CAT_SUBWAY = 0;
const CAT_BUS = 1;
const CAT_COMMUTER_RAIL = 2;
const CAT_FERRY = 3;

class UIRouteCategory {
    constructor(idBase) {
        this._idBase = idBase;
        
        this.routeIdsAndNames = [];
        this.activeRouteIds = new Set();
        this.routeElementEntries = [];
        
        this.isLoadedFromStorage = false;
    }
    
    get idBase() { return this._idBase; }
    
    getStorageKey() { return 'uiRouteCategory_' + this.idBase; }
    
    loadFromStorage(storage) {
        this.isLoadedFromStorage = false;
        
        var value = storage.getItem(this.getStorageKey());
        if (value) {
            try {
                var jsonValue = JSON.parse(value);
                if (jsonValue.activeRouteIds) {
                    this.activeRouteIds.clear();
                    jsonValue.activeRouteIds.forEach((routeId) => this.activeRouteIds.add(routeId));
                    this.isLoadedFromStorage = true;
                }
            }
            catch (e) {
            }
        }
    }
    
    saveToStorage(storage) {
        if (!tLayers.isSaveSettings) {
            return;
        }
        
        var jsonValue = {
            activeRouteIds: Array.from(this.activeRouteIds)
        };
        var value = JSON.stringify(jsonValue);
        storage.setItem(this.getStorageKey(), value);
    }
}

var uiRouteCategories = [
    new UIRouteCategory('subway'),
    new UIRouteCategory('bus'),
    new UIRouteCategory('commuterRail'),
    new UIRouteCategory('ferry')
];

var isCloseSplash = true;


function loadTLayersFromStorage(storage) {
    var value = storage.getItem(tLayersStorageKey);
    if (value) {
        try {
            var jsonValue = JSON.parse(value);
            if (jsonValue) {
                tLayers.updateSettingsFromJSON(jsonValue);
            }
        } catch (e) {
            
        }
    }
}

function saveTLayersToStorage(storage) {
    var jsonValue = tLayers.getSettingsAsJSON();
    var value = JSON.stringify(jsonValue);
    storage.setItem(tLayersStorageKey, value);
}


function clearMarks(map) {
    map.forEach((entry) => {
        entry.clearMark();
    });
}

function showHideFromMarked(map) {
    map.forEach((entry) => {
        (entry.markCount) ? entry.show() : entry.hide();
    });
}

function showIfMarked(map) {
    map.forEach((entry) => {
        if (entry.markCount) {
            entry.show();
        }
    });
}

function hideIfNotMarked(map) {
    map.forEach((entry) => {
        if (!entry.markCount) {
            entry.hide();
        }
    });
}


function showAllMarked() {
    showIfMarked(shapes);
    showIfMarked(stops);
    //showIfMarked(trips);
    showIfMarked(vehicles);
    //showIfMarked(routes);
}


function updateSplashStatusMsg(msg) {
    var element = document.getElementById('load_status');
    element.innerHTML = msg;
}

function updateStatusMsg(msg) {
    var element = document.getElementById('status');
    var date = new Date(Date.now());
    element.innerHTML = "Last updated from MBTA: " + date.toLocaleString();
}

function onUpdate() {
    //console.log('start onUpdate');
    clearMarks(stops);
    clearMarks(shapes);
    clearMarks(trips);
    clearMarks(vehicles);
    clearMarks(routes);
    
    tLayers.currentUpdateDate = Date.now();
    
    updateSplashStatusMsg("Loading subway route details...");
    tLayers.routeLayerEntryPromise(uiRouteCategories[CAT_SUBWAY].activeRouteIds)
            .then((routeEntries) => {
                updateStatusMsg();
                
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showAllMarked();
                updateSplashStatusMsg("Loading commuter rail route details...");
                return tLayers.routeLayerEntryPromise(uiRouteCategories[CAT_COMMUTER_RAIL].activeRouteIds);
            })
            .then((routeEntries) => {
                updateStatusMsg();
                
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showAllMarked();
                updateSplashStatusMsg("Loading bus route details...");
                return tLayers.routeLayerEntryPromise(uiRouteCategories[CAT_BUS].activeRouteIds);
            })
            .then((routeEntries) => {
                updateStatusMsg();
                
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showAllMarked();
                updateSplashStatusMsg("Loading ferry route details...");
                return tLayers.routeLayerEntryPromise(uiRouteCategories[CAT_FERRY].activeRouteIds);
            })
            .then((routeEntries) => {
                updateStatusMsg();
                
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showHideFromMarked(stops);
                showHideFromMarked(shapes);
                showHideFromMarked(trips);
                showHideFromMarked(vehicles);
                showHideFromMarked(routes);
                
                if (isCloseSplash) {
                    document.getElementById('splash').classList.add('hide');
                    document.getElementById('loading').classList.add('hide');
                    document.getElementById('load_status').classList.add('hide');
                    isCloseSplash = false;
                }
                
//                console.log('finish onUpdate');
            });
}


function makeValidElementId(string) {
    return string.replace(/\W/g, '_');
}

function addCheckboxItem(parent, id, text, isChecked, onclick) {
    var container = document.createElement('label');
    container.classList.add('checkboxcontainer');
    container.id = id;
    container.innerHTML = text;

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = '_input_' + id;
    if (isChecked) {
        input.checked = 'checked';
    }
    container.appendChild(input);
    
    input.onclick = onclick;
    
    var span = document.createElement('span');
    span.classList.add('checkmark');
    container.appendChild(span);

    parent.appendChild(container);
    
    // This stops the onclick from going up the parent chain and triggering the main
    // window.onclick, which closes the drop downs (we don't want the drop down to close
    // just when a checkbox item is toggled.
    container.onclick = function(event) {
        event.stopPropagation();
    };
    
    return {
        container: container,
        input: input,
        span: span
    };
}

function dropDownClick(elementId) {
    var dropDownElement = document.getElementById(elementId);
    closeDropDowns(dropDownElement);
    dropDownElement.classList.toggle('show');
    
}

function hideDropDownList(dropDownListElement) {
    if (dropDownListElement.classList.contains('show')) {
        dropDownListElement.classList.remove('show');
    }
}

function closeDropDowns(except) {
    var dropdowns = document.getElementsByClassName('dropdown-content');
    for (var i = 0; i < dropdowns.length; ++i) { 
        if (dropdowns[i] !== except) {
            hideDropDownList(dropdowns[i]); 
        }
    }
}

function showElement(element, show) {
    if (show) {
        if (element.classList.contains('hide')) {
            element.classList.remove('hide');
        }
    }
    else {
        element.classList.add('hide');
    }
}

function setupDropDownMenu(buttonElementId, dropDownElementId) {
    var button = document.getElementById(buttonElementId);
    button.onclick = () => dropDownClick(dropDownElementId);
}


function updateRoutesMenuState(uiCategory) {
    uiCategory.routeElementEntries.forEach((entry) => {
        entry.input.checked = uiCategory.activeRouteIds.has(entry.routeId);
    });
}

function displayNameFromRouteIdAndName(routeIdAndName) {
    if (routeIdAndName.type === tLayers.ROUTE_BUS) {
        return routeIdAndName.shortName + "-" + routeIdAndName.longName;
    }
    else {
        return routeIdAndName.longName;
    }
}

function setupRoutesMenu(categoryIndex) {
    var uiCategory = uiRouteCategories[categoryIndex];
    var idBase = uiCategory.idBase;
    var menuItem;

    setupDropDownMenu(idBase + 'Btn', idBase + 'DropDownList');
    
    menuItem = document.getElementById(idBase + 'ShowAllMenu');
    menuItem.onclick = () => {
        uiCategory.activeRouteIds = new Set();
        uiCategory.routeIdsAndNames.forEach((routeIdAndName) => {
            uiCategory.activeRouteIds.add(routeIdAndName.id);
        });
        uiCategory.saveToStorage(storage);
        updateRoutesMenuState(uiCategory);
        onUpdate();
        closeDropDowns();
    };

    menuItem = document.getElementById(idBase + 'HideAllMenu');
    menuItem.onclick = () => {
        uiCategory.activeRouteIds.clear();
        uiCategory.saveToStorage(storage);
        updateRoutesMenuState(uiCategory);
        onUpdate();
        closeDropDowns();
    };
    
    var dropDownList = document.getElementById(idBase + 'DropDownList');
    uiCategory.routeIdsAndNames.forEach((routeIdAndName) => {
        var id = makeValidElementId(routeIdAndName.id);
        var onClick = function(e) {
            if (e.target.checked) {
                uiCategory.activeRouteIds.add(routeIdAndName.id);
            }
            else {
                uiCategory.activeRouteIds.delete(routeIdAndName.id);
            }
            uiCategory.saveToStorage(storage);
            onUpdate();
        };
        
        var name = displayNameFromRouteIdAndName(routeIdAndName);

        var result = addCheckboxItem(dropDownList, id, name, false, onClick);
        result.routeId = routeIdAndName.id;
        uiCategory.routeElementEntries.push(result);
    });
    
    updateRoutesMenuState(uiCategory);
}


function routeIdAndNameSort(a, b) {
    // This tries to sort by bus number, but we want to clump the CT and Silverline buses
    // together, which have numbers in the 700 range, so use shortName instead.
    if (a.shortName && b.shortName) {
        var aNum = Number.parseInt(a.shortName, 10);
        if (!Number.isNaN(aNum)) {
            var bNum = Number.parseInt(b.shortName, 10);
            if (!Number.isNaN(bNum)) {
                return aNum - bNum;
            }
        }
    }
    
    var aName = displayNameFromRouteIdAndName(a);
    var bName = displayNameFromRouteIdAndName(b);
    return aName.localeCompare(bName);
}


function setupUI() {
    setupRoutesMenu(CAT_SUBWAY);
    setupRoutesMenu(CAT_BUS);
    setupRoutesMenu(CAT_COMMUTER_RAIL);
    setupRoutesMenu(CAT_FERRY);
}


function onSplash() {
    closeDropDowns();
    
    var splashElement = document.getElementById('splash');
    if (!splashElement.classList.contains('hide')) {
        return;
    }
    
    showElement(splashElement, true);
    
    splashElement.onclick = function() {
        showElement(splashElement, false);
    };
}

function updateToggleMenuItem(item, menuId) {
    var element= document.getElementById(menuId);
    element.checked = tLayers[item];
}

function toggleItem(item, menuId) {
    tLayers[item] = !tLayers[item];
    updateToggleMenuItem(item, menuId);
    saveTLayersToStorage(storage);
    onUpdate();
    closeDropDowns();
}


//
// Real start...
//

    var layer = Tangram.leafletLayer({
        scene: 'scene.yaml',
        attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/" target="_blank">Mapzen</a> | <a href="https://mbta.com/" target="_blank">MBTA MassDOT</a>'
    });
    layer.addTo(map);
    map.setView([42.356402, -71.062471], 13);

    uiRouteCategories.forEach((category) => category.loadFromStorage(storage));
    loadTLayersFromStorage(storage);
    
    updateToggleMenuItem('isEstimateVehicleLocations', 'estimateVehicleLocationsMenu');
    updateToggleMenuItem('isSaveSettings', 'saveSettingsMenu');

    setupDropDownMenu('settingsBtn', 'settingsDropDownList');
    

    updateSplashStatusMsg("Fetching subway route ids...");
    tLayers.fetchRouteIdsAndNames([tLayers.ROUTE_LIGHT_RAIL])
            .then((routeIdsAndNames) => { 
                uiRouteCategories[CAT_SUBWAY].routeIdsAndNames = routeIdsAndNames;
                return tLayers.fetchRouteIdsAndNames([tLayers.ROUTE_HEAVY_RAIL]);
            })
            .then((routeIdsAndNames) => { 
                uiRouteCategories[CAT_SUBWAY].routeIdsAndNames = uiRouteCategories[CAT_SUBWAY].routeIdsAndNames.concat(routeIdsAndNames); 
                updateSplashStatusMsg("Fetching commuter rail route ids...");
                return tLayers.fetchRouteIdsAndNames([tLayers.ROUTE_COMMUTER_RAIL]);
            })
            .then((routeIdsAndNames) => { 
                uiRouteCategories[CAT_COMMUTER_RAIL].routeIdsAndNames = routeIdsAndNames; 
                updateSplashStatusMsg("Fetching bus route ids...");
                return tLayers.fetchRouteIdsAndNames([tLayers.ROUTE_BUS]);
            })
            .then((routeIdsAndNames) => { 
                uiRouteCategories[CAT_BUS].routeIdsAndNames = routeIdsAndNames; 
                updateSplashStatusMsg("Fetching ferry route ids...");
                return tLayers.fetchRouteIdsAndNames([tLayers.ROUTE_FERRY]);
            })
            .then((routeIdsAndNames) => { 
                uiRouteCategories[CAT_FERRY].routeIdsAndNames = routeIdsAndNames;
        
                uiRouteCategories.forEach((uiCategory) => 
                    uiCategory.routeIdsAndNames.sort(routeIdAndNameSort));
        
                if (!uiRouteCategories[CAT_SUBWAY].isLoadedFromStorage) {
                    uiRouteCategories[CAT_SUBWAY].activeRouteIds = new Set(uiRouteCategories[CAT_SUBWAY].routeIdsAndNames);
                }
                
                setupUI();
                
                isCloseSplash = false;
                onUpdate();
                isCloseSplash = true;
                
                console.log('route Ids loaded');
            });
    
    //isShapesDisplayed = false;
    
    setInterval(onUpdate, 5000);


    return {
        toggleItem: toggleItem,
        onSplash: onSplash
    };
}());
