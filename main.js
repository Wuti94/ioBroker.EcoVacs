'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require("fs");
const sucks = require('sucks')
, countries = sucks.countries
, EcoVacsAPI = sucks.EcoVacsAPI
, VacBot = sucks.VacBot;
const nodeMachineId = require('node-machine-id');
const http = require('http');

var AName = ("ecovacs.0.");

let account_id = null;
let password = null;
let password_hash = null;
let vacbot = null;
let country = null;
let continent = null;
let device_id = EcoVacsAPI.md5(nodeMachineId.machineIdSync());

class Template extends utils.Adapter {

  /**
  * @param {Partial<ioBroker.AdapterOptions>} [options={}]
  */

  constructor(options) {
    super({
      ...options,
      name: 'ecovacs',
    });
    this.on('ready', this.onReady.bind(this));
    //this.on('objectChange', this.onObjectChange.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    // this.on("message", this.onMessage.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  async onReady() {

  //Daten aus der Config auslesen und einfügen
  account_id = this.config.Benutzername;
  password_hash = this.config.Passwort;

  //Pfad zu den States zusammengefasst!
  AName = (AName + device_id);
  this.log.debug(AName);

  // States erstellen (aktuell nur start und stop)
  await this.setObjectAsync(device_id + '.start', {
    type: 'state',
    common: {
      name: 'Saugen starten',
      type: 'state',
      role: 'button',
      read: true,
      write: true,
    },
    native: {},
  });

  await this.setObjectAsync(device_id + '.stop', {
    type: 'state',
    common: {
      name: 'Saugen stoppen',
      type: 'state',
      role: 'button',
      read: true,
      write: true,
    },
    native: {},
  });

  //Country und Kontinent des Ortes werden automatisiert abgerufen!
    httpGetJson('http://ipinfo.io/json').then((json) => {
      country = json['country'].toLowerCase();
      continent = countries[country.toUpperCase()].continent.toLowerCase();

      //Darstellen der Anmeldeinformationen
      this.log.debug("Land: " + country);
      this.log.debug("Kontinent: " + continent);
      this.log.debug("Benutzername/Email: " + account_id);
      this.log.debug("Passwort MD5 Hash: " + password_hash);

      var api = new EcoVacsAPI(device_id, country, continent);

      //Verbindung herstellen mit Anmeldeinformationen
      api.connect(account_id, password_hash).then(() => {
        api.devices().then((devices) => {
          let vacuum = devices[0];
          vacbot = new VacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);

          //Sobald mit Staubsauger Verbunden!
          vacbot.on("ready", (event) => {
            this.log.info("Deebot ready!");

            //Event sobald sich der Batteriestatus ändert!
            vacbot.on("BatteryInfo", (battery) => {
              this.log.info("Battery level: " + battery * 100);
            });

          });
          vacbot.connect_and_wait_until_ready();
        });
      }).catch((e) => {
        this.log.info("Failure in connecting!");
      });
    });

    function httpGetJson(url) {
      return new Promise((resolve, reject) => {
        http.get(url, (res) => {
          res.setEncoding('utf8');
          let rawData = '';
          res.on('data', (chunk) => { rawData += chunk; });
          res.on('end', function(){
            try {
              const json = JSON.parse(rawData);
              resolve(json);
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', (e) => {
          reject(e);
        });
      });
    }
    this.subscribeStates('*'); //Reagiere auf alle sich änderne States
  }

  /**
  * Is called when adapter shuts down - callback has to be called under any circumstances!
  * @param {() => void} callback
  */

  onUnload(callback) {
    try {
      this.log.info('cleaned everything up...');
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
  * Is called if a subscribed state changes
  * @param {string} id
  * @param {ioBroker.State | null | undefined} state
  */

  onStateChange(id, state) {
    if (state) {
      if (id === AName + ".start"){
        this.log.info("Starte sauger!!");
        vacbot.run("clean");
      } else if (id === AName + ".stop"){
          this.log.info("Stoppe sauger!!");
          vacbot.run("stop");
          vacbot.run("charge");
      }
    } else {
        // The state was deleted
        this.log.info(`state ${id} deleted`);
      }
    }
}

if (module.parent) {
  // Export the constructor in compact mode
  /**
  * @param {Partial<ioBroker.AdapterOptions>} [options={}]
  */
  module.exports = (options) => new Template(options);
} else {
  // otherwise start the instance directly
  new Template();
}
