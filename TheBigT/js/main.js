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

(function() {
    'use strict';

//
// TODO:
// Welcome message.
// Save state.
// Need to consolidate stops that are almost on top of each other so we can see
// predictions for both directions.
    
var shapes = new Map();
var stops = new Map();
var trips = new Map();
var vehicles = new Map();
var routes = new Map();

var map;

const CAT_SUBWAY = 0;
const CAT_BUS = 1;
const CAT_COMMUTER_RAIL = 2;
const CAT_FERRY = 3;

class UIRouteCategory {
    constructor(idBase) {
        this._idBase = idBase;
        
        this.routeIds = [];
        this.activeRouteIds = new Set();
        this.routeElementEntries = [];
    }
    
    get idBase() { return this._idBase; }
}

var uiRouteCategories = [
    new UIRouteCategory('subway'),
    new UIRouteCategory('bus'),
    new UIRouteCategory('commuterRail'),
    new UIRouteCategory('ferry')
];

var isCloseSplash = true;

var isStopsDisplayed = true;
var isShapesDisplayed = true;
var isVehiclesDisplayed = true;

var currentUpdateDate = new Date();

var maxTimeStampFadeMilliSeconds = 3 * 60 * 1000;


class LayerEntry {
    constructor(id, jsonData, mapLayer) {
        this._id = id;
        this._jsonData= jsonData;
        this._mapLayer = mapLayer;
        this._markCount = 0;

        this._isShowing = false;
        this._isLayerInMap = false;
        
        this._visibleCount = 0;
    }
    
    get id() { return this._id; }
    get jsonData() { return this._jsonData; }
    
    // The mark count is used for a mark and sweep type of detection.
    get markCount() { return this._markCount; }
    mark() { ++this._markCount; }
    
    clearMark() { this._markCount = 0; }
    
    
    get mapLayer() { return this._mapLayer; }
    set mapLayer(mapLayer) {
        if (this._mapLayer !== mapLayer) {
            if (this._isLayerInMap) {
                map.removeLayer(this._mapLayer);
            }
            this._mapLayer = mapLayer;
            if (this._isLayerInMap) {
                if (this._mapLayer) {
                    this._mapLayer.addTo(map);
                }
                else {
                    this._isLayerInMap = false;
                }
            }
        }
    }
    
    show() {
        if (this._mapLayer) {
            if (this.isTypeDisplayed()) {
                if (!this._isLayerInMap) {
                    this._mapLayer.addTo(map);
                    this._isLayerInMap = true;
                }
            }
        }
        this._isShowing = true;

        return this;
    }
    
    hide() {
        if (this._isShowing) {
            if (this._isLayerInMap) {
                if (this._mapLayer) {
                    map.removeLayer(this._mapLayer);                    
                }
                this._isLayerInMap = false;
            }
            this._isShowing = false;
        }
        return this;
    }
    
    isTypeDisplayed() {
        return true;
    }
};

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

function markIfRouteId(map, routeId) {
    map.forEach((entry) => {
        if (entry.routeId === routeId) {
            entry.mark();
        }
    });
}


class StopLayerEntry extends LayerEntry {
    constructor(stopId, jsonData, mapLayer) {
        super(stopId, jsonData, mapLayer);
    }
    
    get name() { return this.jsonData.attributes.name; }
/*
{
  "data": {
    "attributes": {
      "address": null,
      "description": null,
      "latitude": 42.416412,
      "location_type": 0,
      "longitude": -71.196852,
      "name": "Wadsworth Rd @ Homer Rd",
      "platform_code": null,
      "platform_name": null,
      "wheelchair_boarding": 0
    },
    "id": "2465",
    "links": {
      "self": "/stops/2465"
    },
    "relationships": {
      "child_stops": {},
      "facilities": {
        "links": {
          "related": "/facilities/?filter[stop]=2465"
        }
      },
      "parent_station": {
        "data": null
      }
    },
    "type": "stop"
  },
  "jsonapi": {
    "version": "1.0"
  }
}
*/
    
    isTypeDisplayed() {
        return isStopsDisplayed;
    }
    
    getStopMsgFromPredictions(predictionEntries) {
        var msg = '<div>' + this.name + '</div>';
        if (predictionEntries) {
            // We only want the first prediction for each route.
            var visitedRoutes = new Set();
            predictionEntries.forEach((predictionEntry) => {
                var routeId = predictionEntry.routeId;
                if (visitedRoutes.has(routeId)) {
                    return;
                }
                
                var predictionMsg = predictionEntry.getPredictionMsg();
                if (!predictionMsg) {
                    return;
                }
                
                visitedRoutes.add(routeId);
                msg += '<div>' + predictionEntry.routeName + ': ' + predictionMsg + '</div>';
            });
        }
        return msg;
    }
};


class ShapeLayerEntry extends LayerEntry {
    constructor(shapeId, jsonData, mapLayer) {
        super(shapeId, jsonData, mapLayer);
    }
    
    get routeId() { return this.jsonData.relationships.route.data.id; }
    get directionId() { return this.jsonData.attributes.direction_id; }
    
    /*
{
  "data": {
    "attributes": {
      "direction_id": 1,
      "name": "Harvard",
      "polyline": "ei{aGfcpqL_@`BUjAQjAI~@Kp@E\\[nBCJ??GXq@vDkA~GWe@c@w@c@q@_@i@MO??MOi@i@s@g@]Sc@]c@y@a@aASk@M_@CIKi@Ca@?iA@cA??@WA{AGaAc@cDG}@De@??BWb@gAp@mAVw@?EB]??B_@Cy@U{@sAaDyAmEa@kA??ISk@wB[kACk@HaAVy@TmAh@S@???v@QlA_@~@]~CaB??NIzI}GXU??dEeDnAeA??NMzAgAz@q@r@_@]Qe@_@m@}@a@i@ESCW?WBSBO?ELSL_@Dc@?c@Ge@Ma@M[QE??c@KWBYLURO\\K\\Gd@@`@?B??FZRZ|@p@d@f@^b@`@h@l@|@d@^\\PZD????l@AfCW\\E??rBUvAMr@IVCn@Ir@I^EDg@??B_@XoGF}@NwB??BWFw@l@mFnA_Il@cD??BKF]p@aDJe@??Rw@lB}Gt@mC?A??b@qBb@uBxBeId@_Bt@oBlAqCv@sBl@mB`@aB??DOXeBf@bAd@r@RTlBbDh@z@\\Y??p@k@\\_@`BaBZYfBcB??LM`@_@bBaBbBaB??LMz@e@bBs@ZO??XM`Ac@vAo@ZQh@YTSPWP]d@oAZy@??HS`AgCh@yA\\y@PWd@i@`@SVKn@M\\E??FAdCk@z@Q??PExA]pBa@nAYnAYbAWd@K\\G??v@OrAYvA]??PEtCk@TEFiA??HsA@_@B_AJiBZ}E?e@???W`@wFXsEZ_E??BU`@yDVeCZsCHk@H_@??FWp@sFPoA??Fe@LkAl@eD??N{@PeAn@w@LKFEHGDGDIDU`@aA`BcDlAyBb@y@R[LKNG??@AJEHIDM@K?IAICKEUCSAg@AKTu@f@wA~@oC??HSdA{C|@mC??FS`AsC~@uC`B{El@cB??HS~AqENc@rAuDl@aBj@uAHO??j@mA|@cB\\w@\\m@`@u@b@_A??HS^{@pBqELW??HSnBoEn@sA??HQlAuCr@}AfAcC??LYt@i@`@]t@k@`A{@i@kC_@wBe@qBG{@La@??DONm@fD}@nAa@h@QEEMUJOL]JQJKNEVEf@GtAGTAZAZAl@@h@B\\F??@?j@Nf@Rb@b@P`@Hd@H|@F|@Dz@Bj@Ap@Dp@B|@Nr@PZRVRw@ZaBf@Z\\T",
      "priority": 2
    },
    "id": "780087",
    "links": {
      "self": "/shapes/780087"
    },
    "relationships": {
      "route": {
        "data": {
          "id": "78",
          "type": "route"
        }
      },
      "stops": {
        "data": [
          {
            "id": "2464",
            "type": "stop"
          },
          {
            "id": "2465",
            "type": "stop"
          },
    ...
          {
            "id": "12614",
            "type": "stop"
          },
          {
            "id": "place-harsq",
            "type": "stop"
          },
          {
            "id": "32549",
            "type": "stop"
          }
        ]
      }
    },
    "type": "shape"
  },
  "jsonapi": {
    "version": "1.0"
  }
}
*/    

    mark() {
        super.mark();
        this.jsonData.relationships.stops.data.forEach((stop) => {
            var stopId = stop.id;
            var stopEntry = stops.get(stopId);
            if (stopEntry) {
                stopEntry.mark();
            }
        });
    }
       
    isTypeDisplayed() {
        return isShapesDisplayed;
    }
};


class TripLayerEntry extends LayerEntry {
    constructor(tripId, jsonData) {
        super(tripId, jsonData);
        this._shapeId = jsonData.relationships.shape.data ? jsonData.relationships.shape.data.id : null;
    }
    
    get headsign() { return this.jsonData.attributes.headsign; }
    get routeId() { return this.jsonData.relationships.route.data.id; }
    get shapeId() { return this._shapeId; }
    
/*
{
  "data": {
    "attributes": {
      "block_id": "T78-43",
      "direction_id": 1,
      "headsign": "Harvard",
      "name": "",
      "wheelchair_accessible": 1
    },
    "id": "37476146",
    "links": {
      "self": "/trips/37476146"
    },
    "relationships": {
      "route": {
        "data": {
          "id": "78",
          "type": "route"
        }
      },
      "service": {
        "data": {
          "id": "BUS32018-hbt38017-Sunday-02",
          "type": "service"
        }
      },
      "shape": {
        "data": {
          "id": "780087",
          "type": "shape"
        }
      }
    },
    "type": "trip"
  },
  "jsonapi": {
    "version": "1.0"
  }
}
*/
       
    isTypeDisplayed() {
        return false;
    }
}


var earthCircumference = 40075000;
var xyToLatLong = 360. / earthCircumference;
var degToRad = Math.PI / 180.;

function verticesToLatitudeLongitude(latitude, longitude, bearingDeg, xys, latLongs) {
    // We're very small scale compared to the earth, we'll just approximate the latitude/longitudes.
    // Of course if the latitude is near the poles, we're screwed...
    var bearingRad = (90 - bearingDeg) * degToRad;
    var cosB = Math.cos(bearingRad);
    var sinB = Math.sin(bearingRad);
    var longScale = xyToLatLong / Math.cos(latitude * degToRad);
    
    latLongs.length = xys.length;
    for (let i = xys.length - 1; i >= 0; --i) {
        let x = xys[i][0];
        let y = xys[i][1];
        latLongs[i] = [
            latitude + (x * cosB + y * sinB) * xyToLatLong,
            longitude + (-x * sinB + y * cosB) * longScale
        ];
    }
}


class VehicleLayerEntry extends LayerEntry {
    constructor(vehicleId, jsonData, vehicleMarker) {
        var mapLayer = vehicleMarker ? vehicleMarker.mapLayer : undefined;
        super(vehicleId, jsonData, mapLayer);
        this._vehicleMarker = vehicleMarker;

        if (this._vehicleMarker) {
            this._vehicleMarker.updateMarkerPosition(this);
        }
    }
    
    get routeId() { return this.jsonData.relationships.route.data.id; }
    get tripId() { return this.jsonData.relationships.trip.data.id; }
    
    get color() { return this.jsonData.attributes.color; }
    get direction() { return this.jsonData.attributes.direction_id; }
    get latitude() { return this.jsonData.attributes.latitude; }
    get longitude() { return this.jsonData.attributes.longitude; }
    get bearing() { return this.jsonData.attributes.bearing; }
    get updatedAt() { return this.jsonData.attributes.updated_at; }
    
/*
{
  "data": [
    {
      "attributes": {
        "bearing": 0,
        "current_status": "IN_TRANSIT_TO",
        "current_stop_sequence": 2,
        "direction_id": 0,
        "label": "1923",
        "latitude": 42.3749885559082,
        "longitude": -71.11891174316406,
        "speed": null,
        "updated_at": "2018-07-17T18:17:20-04:00"
      },
      "id": "y1923",
      "links": {
        "self": "/vehicles/y1923"
      },
      "relationships": {
        "route": {
          "data": {
            "id": "72",
            "type": "route"
          }
        },
        "stop": {
          "data": {
            "id": "2170",
            "type": "stop"
          }
        },
        "trip": {
          "data": {
            "id": "37472385",
            "type": "trip"
          }
        }
      },
      "type": "vehicle"
    }
  ],
  "jsonapi": {
    "version": "1.0"
  }
} */    
    
    updateJSONData(jsonData) {
        var lastRouteId = this.routeId;
        var lastTripId = this.tripId;
        
        this._jsonData = jsonData;

        // If we have a marker, update the marker...
        if (this._vehicleMarker) {
            this._vehicleMarker.updateMarkerPosition(this);
        }
    }
       
    isTypeDisplayed() {
        return isVehiclesDisplayed;
    }
    
    getVehicleMsgFromPredictions(predictionEntries) {
        var msg = '<div>';
        var routeEntry = routes.get(this.routeId);
        if (routeEntry) {
            msg += routeEntry.name + ' ' + routeEntry.directionNames[this.direction];
        }
        else {
            msg += this.routeId;
        }
        msg += '</div>';

        if (predictionEntries && predictionEntries.length) {
            var predictionMsg = predictionEntries[0].getPredictionMsg();
            if (predictionMsg) {
                var stopName = predictionEntries[0].stopName;
                if (!stopName) {
                    // TEST!!!
                    stopName = predictionEntries[0].stopId;
                }
                if (stopName) {
                    stopName += ': ';
                }
                msg += '<div>' + stopName + predictionMsg + '</div>';
            }
        }
            
        msg += '<div>Vehicle: ' + this.id + '</div>';
        msg += '<div>Bearing: ' + this.bearing + '</div>';
        msg += '<div>Last updated: ' + this.updatedAt + '</div>';
        return msg;
    }
}


class RouteLayerEntry extends LayerEntry {
    constructor(routeId, jsonData, mapLayer) {
        super(routeId, jsonData, mapLayer);
    }
/*
{
  "data": [
    {
      "attributes": {
        "color": "FFC72C",
        "description": "Local Bus",
        "direction_names": [
          "Outbound",
          "Inbound"
        ],
        "long_name": "",
        "short_name": "78",
        "sort_order": 7800,
        "text_color": "000000",
        "type": 3
      },
      "id": "78",
      "links": {
        "self": "/routes/78"
      },
      "type": "route"
    }
  ],
  "jsonapi": {
    "version": "1.0"
  }
} */    
    
    get routeType() { return this.jsonData.attributes.type; }
    get name() { return (this.jsonData.attributes.long_name) 
        ? this.jsonData.attributes.long_name : this.jsonData.attributes.short_name; }
    get directionNames() { return this.jsonData.attributes.direction_names; }
    
    mark() {
        super.mark();
        var routeId = this.id;
        markIfRouteId(vehicles, routeId);
        markIfRouteId(shapes, routeId);
    }
       
    isTypeDisplayed() {
        return false;
    }
}

const ROUTE_LIGHT_RAIL = 0;
const ROUTE_HEAVY_RAIL = 1;
const ROUTE_COMMUTER_RAIL = 2;
const ROUTE_BUS = 3;
const ROUTE_FERRY = 4;


class VehicleMarker {
    constructor(vertices, options) {
        this._vertices = vertices;
        this._latLongs = [];
        verticesToLatitudeLongitude(42, -72, 0, vertices, this._latLongs);
        
        this._mapLayer = L.polygon(this._latLongs, options);
    }
    
    get mapLayer() { return this._mapLayer; }
    
    updateMarkerPosition(vehicleLayerEntry) {
        if (this._mapLayer) {
            verticesToLatitudeLongitude(vehicleLayerEntry.latitude, vehicleLayerEntry.longitude,
                vehicleLayerEntry.bearing, this._vertices, this._latLongs);
            this._mapLayer.setLatLngs(this._latLongs);
            
            var opacity;
            var date = new Date(vehicleLayerEntry.updatedAt);
            if (!Number.isNaN(date.getHours())) {
                var ageMilliseconds = currentUpdateDate - date.valueOf();
                ageMilliseconds = Math.max(0, ageMilliseconds);
                ageMilliseconds = Math.min(ageMilliseconds, maxTimeStampFadeMilliSeconds);
                var scale = ageMilliseconds / maxTimeStampFadeMilliSeconds;
                opacity = 1 - scale * 0.8;
            }
            else {
                opacity = 0.2;
            }
            
            this._mapLayer.setStyle({ fillOpacity: opacity });
        }
    }

}


var lightRailVertices = [
    [0, 0],
    [50, -50],
    [50, -150],
    [0, -100],
    [-50, -150],
    [-50, -50]
];

class LightRailMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        super(lightRailVertices, {
            fillColor: 'DarkGreen',
            fillOpacity: 1,
            weight: 0
        });
    }    
}

var heavyRailVertices = [
    [0, 0],
    [50, -50],
    [50, -200],
    [0, -150],
    [-50, -200],
    [-50, -50]
];

class HeavyRailMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        var color;
        switch (routeLayerEntry.id) {
            case 'Red' :
                color = 'DarkRed';
                break;
                
            case 'Orange' :
                color = 'DarkOrange';
                break;
                
            case 'Blue' :
                color = 'DarkBlue';
                break;
        }
        
        super(heavyRailVertices, {
                fillColor: color,
                fillOpacity: 1,
                color: color,
                opacity: 0.5,
                weight: 0
            });
    }
    
}

var commuterRailVertices = [
    [0, 0],
    [50, -50],
    [50, -250],
    [0, -200],
    [-50, -250],
    [-50, -50]
];

class CommuterRailMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        super(commuterRailVertices, {
            fillColor: 'purple',
            fillOpacity: 1,
            weight: 0
        });
    }    
}

var busHWidth = 30;
var busVertices = [
    [0, 0],
    [busHWidth, -busHWidth],
    [busHWidth, -100],
    [0, -100 + busHWidth],
    [-busHWidth, -100],
    [-busHWidth, -busHWidth]
    //[0, 140 * 12 / 39.37]
];
class BusMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        super(busVertices, {
            fillColor: 'darkCyan',
            fillOpacity: 1,
            weight: 0
        });
    }
}


var ferryVertices = [
    [0, 0],
    [50, -50],
    [50, -150],
    [0, -100],
    [-50, -150],
    [-50, -50]
    //[0, 140 * 12 / 39.37]
];
class FerryMarker extends VehicleMarker {
    constructor() {
        super(ferryVertices, {
            fillColor: 'white',
            fillOpacity: 1,
            weight: 0
        });
    }
}


class PredictionEntry {
    constructor(jsonData) {
        this._jsonData = jsonData;
    }
    
    get directionId() { return this._jsonData.attributes.direction_id; }
    
    get routeId() { return this._jsonData.relationships.route.data.id; }
    get routeName() {
        var routeId = this.routeId;
        var entry = routes.get(routeId);
        if (entry) {
            var direction = entry.directionNames[this.directionId];
            if (direction) {
                return entry.name + ' ' + direction;
            }
            return entry.name;
        }
        return routeId;
    }
    
    get stopId() { return this._jsonData.relationships.stop.data.id; }
    get stopName() {
        var stopId = this.stopId;
        var entry = stops.get(stopId);
        if (entry) {
            return entry.name;
        }
        return '';
    }
    
    get arrivalTime() { return this._jsonData.attributes.arrival_time; }
    get deparatureTime() { return this._jsonData.attributes.departure_time; }
    
    getPredictionMsg() {        
        var arrival = this.arrivalTime;
        var departure = this.departureTime;
        if (!arrival && !departure) {
            return '';
        }
        
        var msg = '';
        if (arrival === departure) {
            msg += dateToHHMMString(new Date(arrival), true) + ' DEP';
        }
        else {
            if (arrival) {
                msg += dateToHHMMString(new Date(arrival), true) + ' ARR';
                if (departure) {
                    msg += '  ';
                }
            }
            if (departure) {
                msg += dateToHHMMString(new Date(departure), true) + ' DEP';
            }
        }
        return msg;
    }
}


function dateToHHMMString(time, includeSeconds) {
    if (!time) {
        return '';
    }
    var hours = time.getHours();
    var suffix = " AM";
    if (hours > 12) {
        hours -= 12;
        suffix = " PM";
    }
    else if (hours === 12) {
        suffix = " PM";
    }
    
    hours = hours.toString();
    if (hours.length === 1) {
        hours = " " + hours;
    }

    var minutes = time.getMinutes().toString();
    if (minutes.length === 1) {
        minutes = "0" + minutes;
    }
    
    var seconds = "";
    if (includeSeconds) {
        seconds = time.getSeconds().toString();
        if (seconds.length === 1) {
            seconds = "0" + seconds;
        }
        seconds = ":" + seconds;
    }
    
    return hours + ':' + minutes + seconds + suffix;
}

function isIterable(obj) {
    if (!obj || (typeof obj === 'string') || (obj instanceof String)) {
        return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
}

function fetchMBTA(path) {
    path += '&api_key=73fba3c751464eafb5e3aa78386fcf23';
    return fetch(path);
}


///////////////////////////////////
// Predictions
///////////////////////////////////
function fetchPredictionByStopId(stopId) {
    var path = 'https://api-v3.mbta.com/predictions?filter%5Bstop%5D=';
    path += stopId;
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processPredictionResult(myJson));
}

function fetchPredictionByTripId(tripId) {
    var path = 'https://api-v3.mbta.com/predictions?filter%5Btrip%5D=';
    path += tripId;
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processPredictionResult(myJson));
}

function processPredictionResult(json) {
    var data = json.data;
    var predictions = [];
    data.forEach((dataItem) => {
        predictions.push(processPredictionData(dataItem));
    });
    
    return predictions;
}

function processPredictionData(data) {
    return new PredictionEntry(data);
}


///////////////////////////////////
// Stops
///////////////////////////////////

function fetchStops(stopIds) {
    var path = 'https://api-v3.mbta.com/stops?include=child_stops&filter%5Bid%5D=';
    if (isIterable(stopIds)) {
        var separator = '';
        for (let stopId of stopIds) {
            path += separator + stopId;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += stopIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processStopsResult(myJson));
}


function processStopsResult(json) {
    var data = json.data;
    var childStopIds = new Set();
    var result;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processStopData(data[i], childStopIds));
        }
        
        result = layerEntries;
    }
    else {
        result = processStopData(data, childStopIds);
    }
    
    if (childStopIds.size) {
        stopLayerEntriesPromise(childStopIds);
    }
    
    return result;
}


function processStopData(data, childStopIds) {
    var stopId = data.id;
    var marker;
    switch (data.attributes.location_type) {
        case 0 :    // Stop
            marker = createStopMarker(data);
            break;
            
        case 1 :    // Station
        case 2 :    // Station entrance/exit.
            marker = createStationMarker(data);
            break;
    }
    
    var layerEntry = new StopLayerEntry(stopId, data, marker);
    stops.set(stopId, layerEntry);
    
    // Want to load the predictions for the stop when the tooltip comes up.
    if (marker) {
        marker.bindTooltip(layerEntry.getStopMsgFromPredictions());
        
        marker.on('tooltipopen', (e) => {
            marker.setTooltipContent(layerEntry.getStopMsgFromPredictions());
            fetchPredictionByStopId(stopId)
                    .then((predictionEntries) => {
                        var msg = layerEntry.getStopMsgFromPredictions(predictionEntries);
                        marker.setTooltipContent(msg);
                    });            
        });
    }
    
    if (childStopIds) {
        var childStops = data.relationships.child_stops.data;
        childStops.forEach((childStop) => childStopIds.add(childStop.id));
    }
    
    return layerEntry;
}


var stopSize = 20;
var stopVertices = [
    [stopSize, -stopSize],
    [stopSize, stopSize],
    [-stopSize, stopSize],
    [-stopSize, -stopSize]
];
function createStopMarker(stopJSON) {
    // TODO: Improve this marker...
    var latitude = stopJSON.attributes.latitude;
    var longitude = stopJSON.attributes.longitude;
    var latLongs = [];
    verticesToLatitudeLongitude(latitude, longitude, 0, stopVertices, latLongs);
    var marker = L.polygon(latLongs, { 
        fillColor: 'steelblue',
        weight: 0
    });
    return marker;
}


function createStationMarker(stopJSON) {
    // TODO: Improve this marker...
    var latitude = stopJSON.attributes.latitude;
    var longitude = stopJSON.attributes.longitude;
    var marker = L.circle([latitude, longitude], {
        radius: 100,
        color: 'darkblue',
        opacity: 0,
        fillOpacity: 0.2
    });
    return marker;
}

function stopLayerEntriesPromise(stopId) {
    if (isIterable(stopId)) {
        var idsNeeded = [];
        var existingEntries = [];
        stopId.forEach((id) => {
            var entry = stops.get(id);
            if (entry) {
                existingEntries.push(entry);
            }
            else {
                idsNeeded.push(id);
            }
        });
        
        if (idsNeeded.length > 0) {
            var promises = [];
            var stopsThisPass = [];
            for (let i = idsNeeded.length; i > 0; i -= stopsThisPass.length) {
                var count = Math.min(i, 50);
                stopsThisPass = idsNeeded.slice(i - count, i);
                promises.push(fetchStops(stopsThisPass)
                        .then((stopEntries) => 
                            existingEntries = existingEntries.concat(stopEntries)));
            }
            return Promise.all(promises)
                    .then(() => existingEntries);
        }
        else {
            return Promise.resolve(existingEntries);
        }
    }
    
    var stopEntry = stops.get(stopId);
    if (stopEntry) {
        return Promise.resolve(stopEntry);
    }
    return fetchStops(stopId);
}


///////////////////////////////////
// Shape
///////////////////////////////////

function fetchShapesByRouteIds(routeIds) {
    var path = 'https://api-v3.mbta.com/shapes?filter%5Broute%5D=';
    var routesFilter = '';
    if (isIterable(routeIds)) {
        var separator = '';
        for (let stopId of routeIds) {
            routesFilter += separator + stopId;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        routesFilter += routeIds;
    }
    
    path += routesFilter;
    
    //console.log('Fetching Shapes for route: ' + routesFilter);
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processShapesResult(myJson));
}

function processShapesResult(json) {
    var data = json.data;
    var stopIdsNeeded = new Set();
    var result;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processShapeData(data[i], stopIdsNeeded));
        }
        
        result = layerEntries;
    }
    else {
        result = processShapeData(data, stopIdsNeeded);
    }
    
    if (stopIdsNeeded.size > 0) {
        return stopLayerEntriesPromise(stopIdsNeeded)
                .then(() => result);
    }

    return result;
}

function processShapeData(data, stopIdsNeeded) {    
    var shapeId = data.id;
    
    var encoded = data.attributes.polyline;
    var polyline = L.polyline(L.PolylineUtil.decode(encoded));
    
    var layerEntry = new ShapeLayerEntry(shapeId, data, polyline);
    shapes.set(shapeId, layerEntry);
    
    var popupMsg;
    
    var routeEntry = routes.get(layerEntry.routeId);
    if (routeEntry) {
        var style = {};
        if (routeEntry.jsonData.attributes.color !== undefined) {
            style.color = '#' + routeEntry.jsonData.attributes.color;
        }
        style.opacity = 0.5;
        
        switch (routeEntry.routeType) {
            case ROUTE_LIGHT_RAIL :
                style.weight = 4;
                break;
            
            case ROUTE_HEAVY_RAIL :
                style.weight = 4;
                break;
                
            case ROUTE_COMMUTER_RAIL :
                style.weight = 3;
                break;
            
            case ROUTE_BUS :
                style.weight = 2;
                break;
                
            case ROUTE_FERRY :
                style.weight = 3;
                break;
        }

        polyline.setStyle(style);
        
        popupMsg = '<div>' + routeEntry.name + '</div>';
        popupMsg += '<div>' + routeEntry.directionNames[layerEntry.directionId] + '</div>';
    }
        
    polyline.bindPopup(popupMsg);
    
    var shapeStops = data.relationships.stops;
    shapeStops.data.forEach((stopData) => {
        if (!stops.get(stopData.id)) {
            stopIdsNeeded.add(stopData.id);
        }
    });

    return layerEntry;
}


function shapeLayerEntriesByRouteIdsPromise(routeIds) {
    return fetchShapesByRouteIds(routeIds);
}



///////////////////////////////////
// Trip
///////////////////////////////////

function fetchTrips(tripIds) {
    var path = 'https://api-v3.mbta.com/trips?filter%5Bid%5D=';
    if (isIterable(tripIds)) {
        var separator = '';
        for (let stopId of tripIds) {
            path += separator + stopId;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += tripIds;
    }
    
    //console.log('Fetching Trip Ids: ' + tripIds);
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processTripsResult(myJson));
}


function processTripsResult(json) {
    var data = json.data;
    var routeIds = new Set();
    var result;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processTripData(data[i]));
            routeIds.add(layerEntries[i].routeId);
        }
        
        result = layerEntries;
    }
    else {
        result = processTripData(data);
        routeIds.add(result.routeId);
    }
    
    return result;
}


function processTripData(data) {
    var tripId = data.id;
    
    var layerEntry = trips.get(tripId);
    if (!layerEntry) {
        layerEntry = new TripLayerEntry(tripId, data);
        trips.set(tripId, layerEntry);
    }
    return layerEntry;
}


function tripLayerEntriesPromise(tripId) {
    var promise;
    
    if (isIterable(tripId)) {
        var idsNeeded = [];
        var existingEntries = [];
        tripId.forEach((id) => {
            var entry = trips.get(id);
            if (entry) {
                existingEntries.push(entry);
            }
            else {
                idsNeeded.push(id);
            }
        });
        
        if (idsNeeded.length > 0) {
            var promises = [];
            var idsThisPass = [];
            for (let i = idsNeeded.length; i > 0; i -= idsThisPass.length) {
                var count = Math.min(i, 50);
                idsThisPass = idsNeeded.slice(i - count, i);
                promises.push(fetchTrips(idsThisPass)
                        .then((entries) => 
                            existingEntries = existingEntries.concat(entries)));
            }
            return Promise.all(promises)
                    .then(() => existingEntries);
        }
        else {
            return Promise.resolve(existingEntries);
        }
    }

    var tripEntry = trips.get(tripId);
    if (tripEntry) {
        return Promise.resolve(tripEntry);
    }
    return fetchTrips(tripId);
}


///////////////////////////////////
// Vehicles
///////////////////////////////////

function fetchVehicles(vehicleIds) {
    var path = 'https://api-v3.mbta.com/vehicles?filter%5Bid%5D=';
    if (isIterable(vehicleIds)) {
        var separator = '';
        for (let id of vehicleIds) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += vehicleIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processVehiclesResult(myJson));
}


function fetchRouteVehicles(routeIds) {
    var path = 'https://api-v3.mbta.com/vehicles?filter%5Broute%5D=';
    if (isIterable(routeIds)) {
        var separator = '';
        for (let id of routeIds) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += routeIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processVehiclesResult(myJson));
}

function createVehicleMarkerFromRouteLayerEntry(routeLayerEntry) {
    if (!routeLayerEntry) {
        return;
    }
    
    switch (routeLayerEntry.routeType) {
        case ROUTE_LIGHT_RAIL :
            return new LightRailMarker(routeLayerEntry);
            
        case ROUTE_HEAVY_RAIL :
            return new HeavyRailMarker(routeLayerEntry);
            
        case ROUTE_COMMUTER_RAIL :
            return new CommuterRailMarker(routeLayerEntry);
            
        case ROUTE_BUS :
            return new BusMarker(routeLayerEntry);
            
        case ROUTE_FERRY :
            return new FerryMarker(routeLayerEntry);
    }
}

// This will also be used for updating vehicle locations, so the entry may already exist.
function processVehicleData(data) {
    var id = data.id;
    var layerEntry = vehicles.get(id);
    if (!layerEntry) {
        var marker;
        var routeLayerEntry = routes.get(data.relationships.route.data.id);
        var marker = createVehicleMarkerFromRouteLayerEntry(routeLayerEntry);
        
        layerEntry = new VehicleLayerEntry(id, data, marker);
        vehicles.set(id, layerEntry);
            
        // Want to load the predictions for the stop when the tooltip comes up.
        var mapLayer = layerEntry.mapLayer;
        if (mapLayer) {
            mapLayer.bindTooltip(layerEntry.getVehicleMsgFromPredictions());

            mapLayer.on('tooltipopen', (e) => {
                mapLayer.setTooltipContent(layerEntry.getVehicleMsgFromPredictions());
                fetchPredictionByTripId(layerEntry.tripId)
                        .then((predictionEntries) => {
                            var msg = layerEntry.getVehicleMsgFromPredictions(predictionEntries);
                            mapLayer.setTooltipContent(msg);
                        });            
            });
        }

    }
    else {
        layerEntry.updateJSONData(data);
    }
    
    return layerEntry;
}


function processVehiclesResult(json) {
    var result;
    var data = json.data;
    var tripIds = [];
    var logMsg = ' ';
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processVehicleData(data[i]));
            tripIds.push(layerEntries[i].tripId);
            logMsg += layerEntries[i].id + '[' + layerEntries[i].latitude + ',' + layerEntries[i].longitude + '] ';
        }
        
        result = layerEntries;
    }
    else {
        var layerEntry = processVehicleData(data);
        tripIds.push(layerEntry.tripId);
        
        logMsg = layerEntry.id + '[' + layerEntry.latitude + ',' + layerEntry.longitude + ']';
        
        result = layerEntry;
    }
    
    //console.log('Processed Vehicle Ids: ' + logMsg);
    
    return tripLayerEntriesPromise(tripIds)
            .then(() => result );
}


function vehicleLayerEntryPromise(routeIds) {
    return fetchRouteVehicles(routeIds);
}



///////////////////////////////////
// Route Layer Entries
///////////////////////////////////

function fetchRouteLayerEntries(routeIds) {
    var path = 'https://api-v3.mbta.com/routes?filter%5Bid%5D=';
    if (isIterable(routeIds)) {
        var separator = '';
        for (let id of routeIds) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += routeIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processRoutesResultForLayer(myJson));
}

function processRouteDataForLayer(data) {
    var id = data.id;
    var layerEntry = routes.get(id);
    if (!layerEntry) {
        layerEntry = new RouteLayerEntry(id, data, null);
        routes.set(id, layerEntry);
    }
    
    return layerEntry;
}

function processRoutesResultForLayer(json) {
    var data = json.data;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processRouteDataForLayer(data[i]));
        }
        
        return layerEntries;
    }
    else {
        return processRouteDataForLayer(data);
    }
}

// This is the main updating.
// This returns a promise whose argument is an array of RouteLayerEntry objects for the route ids.
function routeLayerEntryPromise(routeIds) {
    if (!isIterable(routeIds)) {
        routeIds = [ routeIds ];
    }
    
    var routeIdsNeeded = [];
    var routeEntries = [];
    routeIds.forEach((routeId) => {
        var entry = routes.get(routeId);
        if (entry) {
            routeEntries.push(entry);
        }
        else {
            routeIdsNeeded.push(routeId);
        }
    });

    var promise;
    if (routeIdsNeeded.length > 0) {
        var routePromises = [];
        routeIdsNeeded.forEach((routeId) => {
            promise = fetchRouteLayerEntries([routeId])
                    .then((entries) => routeEntries.concat(entries));
            routePromises.push(promise);
        });
        promise = Promise.all(routePromises)
                .then(() => fetchShapesByRouteIds(routeIdsNeeded))
                .then(() => routeEntries);
    }
    else {
        promise = Promise.resolve(routeEntries);
    }

    return promise
            .then((entries) => {
                return vehicleLayerEntryPromise(routeIds).then(() => entries);
            });
}



function fetchRouteIds(types) {
    var path = 'https://api-v3.mbta.com/routes';
    if (isIterable(types)) {
        path += '?filter%5Btype%5D=';
        var separator = '';
        for (let id of types) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else if (types) {
        // Presume it's a single value
        path += '?filter%5Btype%5D=';
        path += types;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processRoutesResultForIds(myJson));
}

function processRoutesResultForIds(json) {
    var ids = [];
    var data = json.data;
    var layerEntries = [];
    for (let i = 0; i < data.length; ++i) {
        ids.push(data[i].id);
    }

    return ids;
}


// Let's see:
// We want to basically filter by routes, so we grab the routes we want.
// Then we grab the vehicles for those routes.
// For each vehicle, we need to grab the shape.


// Configuration UI:
// Hierarchy check list:
//  Subways:
//      - All
//      - None
//      Blue Line
//      Green Line
//      Orange Line
//      Red Line
//
//  Commuter Rail:
//      - All
//      - None
//      Fitchburg
//      Etc.
//  
//  Buses:
//      - All
//      - None
//      
//  Boats:
//      - All
//      - None
//      
//
//  Style:
//      Bus Stops: Diamond
//      Subway Stops: Circle
//      Commuter Rail Stops: Square
//

    // Some notes:
    // Have color start to fade to gray as the data gets stale.
    
    // Inbound routes one color
    // Outbound routes another color?
function showAllMarked() {
    showIfMarked(shapes);
    showIfMarked(stops);
    //showIfMarked(trips);
    showIfMarked(vehicles);
    //showIfMarked(routes);
}

function onUpdate() {
    console.log('start onUpdate');
    clearMarks(stops);
    clearMarks(shapes);
    clearMarks(trips);
    clearMarks(vehicles);
    clearMarks(routes);
    
    currentUpdateDate = Date.now();
    
    routeLayerEntryPromise(uiRouteCategories[CAT_BUS].activeRouteIds)
            .then((routeEntries) => {
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showAllMarked();
                return routeLayerEntryPromise(uiRouteCategories[CAT_COMMUTER_RAIL].activeRouteIds);
            })
            .then((routeEntries) => {
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showAllMarked();
                return routeLayerEntryPromise(uiRouteCategories[CAT_SUBWAY].activeRouteIds);
            })
            .then((routeEntries) => {
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showAllMarked();
                return routeLayerEntryPromise(uiRouteCategories[CAT_FERRY].activeRouteIds);
            })
            .then((routeEntries) => {
                routeEntries.forEach((entry) => {
                    entry.mark();
                });
                showHideFromMarked(stops);
                showHideFromMarked(shapes);
                showHideFromMarked(trips);
                showHideFromMarked(vehicles);
                showHideFromMarked(routes);
                
                if (isCloseSplash && routeEntries.length) {
                    document.getElementById('splash').classList.add('hide');
                    document.getElementById('loading').classList.add('hide');
                    isCloseSplash = true;
                }
                
                console.log('finish onUpdate');
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

function setupDropDownMenu(buttonElementId, dropDownElementId) {
    var button = document.getElementById(buttonElementId);
    button.onclick = () => dropDownClick(dropDownElementId);
}


function updateRoutesMenuState(uiCategory) {
    uiCategory.routeElementEntries.forEach((entry) => {
        entry.input.checked = uiCategory.activeRouteIds.has(entry.routeId);
    });
}

function setupRoutesMenu(categoryIndex) {
    var uiCategory = uiRouteCategories[categoryIndex];
    var idBase = uiCategory.idBase;
    var menuItem;

    setupDropDownMenu(idBase + 'Btn', idBase + 'DropDownList');
    
    menuItem = document.getElementById(idBase + 'ShowAllMenu');
    menuItem.onclick = () => {
        uiCategory.activeRouteIds = new Set(uiCategory.routeIds);
        updateRoutesMenuState(uiCategory);
        onUpdate();
        closeDropDowns();
    };

    menuItem = document.getElementById(idBase + 'HideAllMenu');
    menuItem.onclick = () => {
        uiCategory.activeRouteIds.clear();
        updateRoutesMenuState(uiCategory);
        onUpdate();
        closeDropDowns();
    };
    
    var dropDownList = document.getElementById(idBase + 'DropDownList');
    uiCategory.routeIds.forEach((routeId) => {
        var id = makeValidElementId(routeId);
        var onClick = function(e) {
            if (e.target.checked) {
                uiCategory.activeRouteIds.add(routeId);
            }
            else {
                uiCategory.activeRouteIds.delete(routeId);
            }
            onUpdate();
        };
        
        var result = addCheckboxItem(dropDownList, id, routeId, false, onClick);
        result.routeId = routeId;
        uiCategory.routeElementEntries.push(result);
    });
    
    updateRoutesMenuState(uiCategory);
}


function routeIdSort(a, b) {
    var aNum = Number.parseInt(a);
    if (!Number.isNaN(aNum)) {
        var bNum = Number.parseInt(b);
        if (!Number.isNaN(bNum)) {
            return aNum - bNum;
        }
    }
    
    return a.toString().localeCompare(b.toString());
}


function setupUI() {
    setupRoutesMenu(CAT_SUBWAY);
    setupRoutesMenu(CAT_BUS);
    setupRoutesMenu(CAT_COMMUTER_RAIL);
    setupRoutesMenu(CAT_FERRY);
}


    map = L.map('map');
    var layer = Tangram.leafletLayer({
        scene: 'scene.yaml',
        attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/" target="_blank">Mapzen</a> | <a href="https://mbta.com/" target="_blank">MBTA MassDOT</a>'
    });
    layer.addTo(map);
    map.setView([42.356402, -71.062471], 13);
        
    fetchRouteIds([ROUTE_LIGHT_RAIL])
            .then((routeIds) => { 
                uiRouteCategories[CAT_SUBWAY].routeIds = routeIds;
                return fetchRouteIds([ROUTE_HEAVY_RAIL]);
            })
            .then((routeIds) => { 
                uiRouteCategories[CAT_SUBWAY].routeIds = uiRouteCategories[CAT_SUBWAY].routeIds.concat(routeIds); 
                return fetchRouteIds([ROUTE_COMMUTER_RAIL]);
            })
            .then((routeIds) => { 
                uiRouteCategories[CAT_COMMUTER_RAIL].routeIds = routeIds; 
                return fetchRouteIds([ROUTE_BUS]);
            })
            .then((routeIds) => { 
                uiRouteCategories[CAT_BUS].routeIds = routeIds; 
                return fetchRouteIds([ROUTE_FERRY]);
            })
            .then((routeIds) => { 
                uiRouteCategories[CAT_FERRY].routeIds = routeIds;
        
                uiRouteCategories.forEach((uiCategory) => 
                    uiCategory.routeIds.sort(routeIdSort));
        
                // Testing...
                uiRouteCategories[CAT_SUBWAY].activeRouteIds.add('Red');

                uiRouteCategories[CAT_SUBWAY].activeRouteIds = new Set(uiRouteCategories[CAT_SUBWAY].routeIds);
                uiRouteCategories[CAT_BUS].activeRouteIds = new Set(uiRouteCategories[CAT_BUS].routeIds);
                uiRouteCategories[CAT_COMMUTER_RAIL].activeRouteIds = new Set(uiRouteCategories[CAT_COMMUTER_RAIL].routeIds);
                uiRouteCategories[CAT_FERRY].activeRouteIds = new Set(uiRouteCategories[CAT_FERRY].routeIds);
                
                setupUI();
                
                isCloseSplash = false;
                onUpdate();
                isCloseSplash = true;
                
                console.log('route Ids loaded');
            });
    
    //isShapesDisplayed = false;
    
    setInterval(onUpdate, 5000);

    
}());
