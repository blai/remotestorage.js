define([
  '../util', './pending', './transaction'
], function(util, pendingAdapter, transactionAdapter) {

  "use strict";

  var DEFAULT_DB_NAME = "remotestorage";
  var DB_VERSION = '1';

  var logger = util.getLogger('store::indexedDb');

  var IndexedDBStore = function(indexedDB, dbName) {
    this.idb = indexedDB;
    this.dbName = dbName;
    this._connect();
  };

  var storeInterface = {
    get: function(path) {
      console.log('TRANS#get', path);
      return this._transaction('get', path);
    },

    set: function(path, node) {
      console.log('TRANS#set', path);
      return this._transaction('put', util.extend({ path: path }, node));
    },

    remove: function(path) {
      console.log('TRANS#remove', path);
      return this._transaction('delete', path);
    },

    _transaction: function(methodName) {
      var args = Array.prototype.slice.call(arguments, 1);
      var promise = util.getPromise();
      var transaction = this.db.transaction(['nodes'], methodName === 'get' ? 'readonly' : 'readwrite');
      var objectStore = transaction.objectStore('nodes');
      console.log('objectStore is', objectStore);
      var request = objectStore[methodName].apply(objectStore, args);
      request.onsuccess = promise.fulfill;
      request.onerror = promise.reject;
      return promise;
    }

  };

  IndexedDBStore.prototype = util.extend(pendingAdapter(), {

    _connect: function() {
      var dbRequest = this.idb.open(this.dbName, DB_VERSION);
      dbRequest.onsuccess = dbRequest.onerror = util.bind(this._dbOpened, this);
      dbRequest.onupgradeneeded = util.bind(this._upgradeDb, this);
    },

    _dbOpened: function(event) {
      if(event.type === "error") {
        console.error("Failed to open database '" + this.dbName + "': ", event);
      } else {
        this.db = event.target.result;
        if(typeof(this.db) === "undefined") {
          console.error("got no db", event);
        }
        console.log('got DB', this.db);

        var store = util.extend({ db: this.db }, storeInterface);
        var realAdapter = transactionAdapter(store, logger);
        util.bindAll(realAdapter, this);
        this.flush(realAdapter);
        delete this.flush;
        delete this.replaceWith;
        delete this.get;
        delete this.set;
        delete this.remove;
        delete this.forgetAll;
        util.extend(this, realAdapter);
      }
    },

    _upgradeDb: function(event) {
      event.target.result.createObjectStore("nodes", {
        keyPath: "path"
      });
    }

  }, util.getEventEmitter('change'));

  // var Transaction = function(objectStore) {
  //   this.store = objectStore;
  // };

  // Transaction.prototype = {
  //   get: function(path) {
  //     console.log("TRANS#get", path);
  //     return this._store('get', path).then(function(event) {
  //       return event.result;
  //     });
  //   },

  //   set: function(path, node) {
  //     console.log("TRANS#set", path);
  //     return this._store('put', util.extend({ path: path }, node));
  //   },

  //   remove: function(path) {
  //     console.log("TRANS#remove", path);
  //     return this._store('delete', path);
  //   },

  //   _store: function(name) {
  //     var args = Array.prototype.slice.call(arguments, 1);
  //     var promise = util.getPromise();
  //     var request = this.store[name].apply(this.store, args);
  //     request.onsuccess = promise.fulfill;
  //     request.onerror = promise.reject;
  //     return promise;
  //   }
  // };

  return function(indexedDB, dbName) {
    return new IndexedDBStore(indexedDB || (
      (typeof(window) !== 'undefined' ? window : global).indexedDB
    ), dbName || DEFAULT_DB_NAME);
  };
});
