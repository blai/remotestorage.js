define(['../util'], function(util) {

  /**
   * Class: RemoteStore
   *
   * 
   */
  var RemoteStore = function(http, options) {
    this.http = http;

    util.extend(this, util.getEventEmitter('state'));

    this._headers = {};

    this.configure(options);
  };

  // constants

  /**
   * Constant: RemoteStore.EMPTY_NODE
   * An empty node object.
   */
  RemoteStore.EMPTY_NODE = {
    data: undefined,
    mimeType: undefined,
    version: null
  };

  /**
   * Constant: RemoteStore.SUCCESS_STATES
   * List of status codes interpreted as success (200, 201, 204, 207).
   */
  RemoteStore.SUCCESS_STATES = { 200:true, 201:true, 204:true, 207:true };
  /**
   * Constant: RemoteStore.NOT_FOUND_STATES
   * List of status codes interpreted as not found (404).
   * (these codes cause a request to succeed with the <RemoteStore.EMPTY_NODE>)
   */
  RemoteStore.NOT_FOUND_STATES = { 404:true };
  /**
   * Constant: RemoteStore.UNAUTHORIZED_STATES
   * List of status codes interpreted as unauthorized (401, 403).
   * (these codes cause <RemoteStore.Unauthorized> to be thrown)
   */
  RemoteStore.UNAUTHORIZED_STATES = { 401:true, 403:true };

  // errors

  /**
   * Error: RemoteStore.Error
   */
  util.declareError(RemoteStore, 'Error');

  /**
   * Error: RemoteStore.Unauthorized
   */
  util.declareError(RemoteStore, 'Unauthorized', function(response) {
    this.response = response;
    return 'the server denied our request! (status: ' + response.status + ', response text: ' + response.body + ')';
  }, RemoteStore.Error);

  /**
   * Error: RemoteStore.NotConnected
   */
  util.declareError(RemoteStore, 'NotConnected', function() {
    return 'not connected';
  }, RemoteStore.Error);

  /**
   * Error: RemoteStore.UnexpectedResponse
   */
  util.declareError(RemoteStore, 'UnexpectedResponse', function(response) {
    this.response = response;
    return 'unexpected response (status: ' + response.status + ')';
  }, RemoteStore.Error);

  /**
   * Error: RemoteStore.InvalidJSON
   */
  util.declareError(RemoteStore, 'InvalidJSON', function(response) {
    this.response = response;
    return 'received invalid JSON: ' + response.body;
  }, RemoteStore.Error);

  // prototype

  RemoteStore.prototype = {

    /**
     * Method: get
     * See <Store.get>
     */
    get: function(path) {
      if(this.state !== 'connected') {
        throw new RemoteStore.NotConnected();
      }
      return this.http('GET', this._urlFor(path), this._headers).
        then(util.bind(this._loadNode, this));
    },

    /**
     * Method: set
     * See <Store.set>
     */
    set: function(path, node) {
      if(this.state !== 'connected') {
        throw new RemoteStore.NotConnected();
      }
      if(typeof(path) !== 'string') {
        throw new Error("Expected 'path' to be a string");
      }
      if(typeof(node) !== 'object') {
        throw new Error("Expected 'node' to be an object");
      }
      var data = (node.mimeType === 'application/json' ?
                  JSON.stringify(node.data) : node.data);
      var contentType = node.mimeType + '; charset=' + (
        node.binary ? 'binary' : 'utf-8'
      );
      var headers = util.extend({
        'Content-Type': contentType
      }, this._headers);
      if(node.version) {
        headers.ETag = node.version;
      }
      return this.http('PUT', this._urlFor(path), headers, data);
    },

    /**
     * Method: remove
     * See <Store.remove>
     */
    remove: function(path) {
      if(this.state !== 'connected') {
        throw new RemoteStore.NotConnected();
      }
      if(typeof(path) !== 'string') {
        throw new Error("Expected 'path' to be a string");
      }
      return this.http('DELETE', this._urlFor(path), this._headers);
    },

    /**
     * Method: configure
     * TODO!!!
     */
    configure: function(options) {
      var state = 'anonymous';
      if(typeof(options) === 'object') {
        // storageInfo? -> connecting!
        if(options.storageInfo) {
          this.storageInfo = options.storageInfo;
          state = 'connecting';
          // bearerToken? -> connected!
          if(options.bearerToken) {
            this.bearerToken = options.bearerToken;
            this._headers['Authorization'] = 'Bearer ' + encodeURIComponent(this.bearerToken);
            state = 'connected';
          }
        }
      }
      if(state !== this.state) {
        this.state = state;
        this.emit('state', state);
      }
    },

    /**
     * Method: reset
     * TODO!!!
     */
    reset: function() {
      delete this.storageInfo;
      delete this.bearerToken;
      this._headers = {};
      this.configure();
    },

    _urlFor: function(path) {
      return this.storageInfo.href + path;
    },

    _loadNode: function(response) {
      var node = util.extend({}, RemoteStore.EMPTY_NODE);
      if(RemoteStore.NOT_FOUND_STATES[response.status]) { // NOT FOUND
        // nothing to do.

      } else if(RemoteStore.SUCCESS_STATES[response.status]) { // SUCCESS
        var contentType = response.headers['content-type'];
        node.mimeType = contentType.split(';')[0];
        node.data = response.body;
        if(contentType.match(/charset=binary/)) {
          node.data = util.rawToBuffer(node.data);
        }
        if(node.mimeType === 'application/json') {
          try {
            node.data = JSON.parse(node.data);
          } catch(exc) {
            throw new RemoteStore.InvalidJSON(response);
          }
        }
        node.version = response.headers['etag'];

      } else if(RemoteStore.UNAUTHORIZED_STATES[response.status]) { // UNAUTHORIZED
        throw new RemoteStore.Unauthorized(response);

      } else { // UNEXPECTED
        throw new RemoteStore.UnexpectedResponse(response);

      }
      return node;
    }

  };

  return RemoteStore;

});
