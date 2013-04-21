if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(['requirejs'], function(requirejs, undefined) {
  var suites = [];

  var curry, util;

  function catchError(test) {
    return function(error) {
      console.error("Caught error: ", error, error && error.stack);
      test.result(false);
    };
  }

  suites.push({
    name: "baseClient.js tests",
    desc: "a collection of tests for baseClient.js",
    setup: function(env) {
      var _this = this;
      requirejs([
        './src/lib/util',
        './src/lib/caching',
        './src/lib/baseClient',
        './src/lib/store',
        './src/lib/sync',
        './src/lib/store/memory'
      ], function(_util, Caching, BaseClient, store, sync, memoryAdapter) {
        util = _util;
        curry = util.curry;
        env.BaseClient = BaseClient;
        var caching = new Caching();
        env.BaseClient.setCaching(caching);
        sync.setCaching(caching);

        caching.set('/', { data: true });

        _this.assertType(BaseClient, 'function');
        env.store = store;
        env.store.setAdapter(memoryAdapter());
      });
    },
    takedown: function(env) {
      env.store.forgetAll();
      env = '';
      this.result(true);
    },
    tests: [
      {
        desc: "constructor w/o moduleName throws an exception",
        run: function(env) {
          try {
            new env.BaseClient();
          } catch(exc) {
            this.result(true);
            return;
          }
          this.result(false);
        }
      },
      {
        desc: "constructor w/ moduleName returns a new client instance",
        run: function(env) {
          var client = new env.BaseClient('test');
          this.assertTypeAnd(client, 'object');
          this.assertAnd(client instanceof env.BaseClient, true);
          this.assert(client.moduleName, 'test');
          env.client = client;
        }
      },
      {
        desc: "makePath prefixes paths correctly",
        run: function(env) {
          var path = env.client.makePath('foo/bar/baz');
          this.assert(path, '/test/foo/bar/baz');
        }
      },
      {
        desc: "makePath prefixes public paths correctly",
        run: function(env) {
          var c = new env.BaseClient('test', true);
          this.assert(c.makePath('foo/bar'), '/public/test/foo/bar');
        }
      },


      {
        desc: "BaseClient#getObject returns a promise",
        run: function(env) {
          this.assertType(env.client.getObject('foo').then, 'function');
        }
      },

      {
        desc: "BaseClient#storeObject returns a promise",
        run: function(env) {
          var promise = env.client.storeObject('foo', 'foo', { "json": "object" });
          this.assertType(promise.then, 'function');
        }
      },

      {
        desc: "BaseClient#getFile returns a promise",
        run: function(env) {
          this.assertType(env.client.getFile('foo').then, 'function');
        }
      },

      {
        desc: "BaseClient#storeFile returns a promise",
        run: function(env) {
          this.assertType(env.client.getFile('foo').then, 'function');
        }
      },

      {
        desc: "BaseClient#remove returns a promise",
        run: function(env) {
          this.assertType(env.client.remove('foo').then, 'function');
        }
      },

      {
        desc: "BaseClient#getObject won't fail if the object doesn't exist",
        run: function(env) {
          var _this = this;
          env.client.getObject('foo/bar').
            then(function(object) {
              _this.assertType(object, 'undefined');
            }, catchError(this));
        }
      },

      {
        desc: "BaseClient#getObject will pass on an object if it finds one",
        run: function(env) {
          var _this = this;
          env.store.setNodeData('/test/foo/baz', { json: 'object' }, false, 12345, 'application/json').
            then(curry(env.client.getObject, 'foo/baz')).
            then(function(object) {
              _this.assert(object, { json: 'object' });
            }, catchError(this));
        }
      },

      {
        desc: "BaseClient#saveObject returns a promise",
        run: function(env) {
          this.assertType(env.client.saveObject({}).then, 'function');
        }
      },

      {
        desc: "BaseClient#saveObject fails when no @context is given",
        run: function(env) {
          var _this = this;
          env.client.saveObject({}).
            then(function() {
              _this.result(false);
            }, function(error) {
              _this.result(!! error);
            });
        }
      },

      {
        desc: "BaseClient#declareType adds a type & schema",
        run: function(env, test) {
          env.client.declareType('foo', { type: 'object', properties: { foo: { type: 'string' } } });
          var type = env.client.types['foo'];
          test.assertTypeAnd(type, 'string');
          test.assertType(env.client.schemas[type], 'object');
        }
      },

      {
        desc: "BaseClient#declareType doesn't influence other clients",
        run: function(env, test) {
          var otherClient = new env.BaseClient('other');
          env.client.declareType('foo', { type: 'object', properties: { foo: { type: 'string' } } });

          test.assertType(otherClient.types['foo'], 'undefined');
        }
      },

      {
        desc: "'change' events are forwarded from store with the correct path and origin",
        run: function(env, test) {
          env.client.on('change', function(event) {
            test.assertAnd(event.path, '/test/foo');
            test.assertAnd(event.relativePath, 'foo');
            test.assert(event.origin, 'remote');
          });
          env.store.emit('change', {
            origin: 'remote',
            oldValue: undefined,
            newValue: { foo: 'bar' },
            path: '/test/foo'
          });
        }
      },

      {
        desc: "storing data causes a 'change' event with the correct path and origin",
        run: function(env, test) {
          env.client.on('change', function(event) {
            test.assertAnd(event.path, '/test/foo/bar');
            test.assertAnd(event.relativePath, 'foo/bar');
            test.assert(event.origin, 'window');
          });
          env.client.storeObject('test', 'foo/bar', { foo: 'bar' });
        }
      },

      {
        desc: "#getAll without a type",
        run: function(env, test) {
          env.client.declareType('foo', { type: 'object' });
          util.asyncGroup(
            curry(env.client.storeObject, 'foo', 'a', { name: 'a' }),
            curry(env.client.storeObject, 'foo', 'b', { name: 'b' }),
            curry(env.client.storeObject, 'foo', 'c', { name: 'c' })
          ).then(curry(env.client.getAll, '', undefined)).
            then(function(objectMap) {
              test.assert(objectMap, {
                a: { name: 'a', '@context': 'http://remotestoragejs.com/spec/modules/test/foo' },
                b: { name: 'b', '@context': 'http://remotestoragejs.com/spec/modules/test/foo' },
                c: { name: 'c', '@context': 'http://remotestoragejs.com/spec/modules/test/foo' }
              });
            });
        }
      },

      {
        desc: "#getAll with a type",
        run: function(env, test) {
          env.client.declareType('foo', { type: 'object' });
          env.client.declareType('bar', { type: 'object' });
          util.asyncGroup(
            curry(env.client.storeObject, 'foo', 'a', { name: 'a' }),
            curry(env.client.storeObject, 'foo', 'b', { name: 'b' }),
            curry(env.client.storeObject, 'bar', 'c', { name: 'c' })
          ).then(curry(env.client.getAll, '', 'foo')).
            then(function(objectMap) {
              test.assert(objectMap, {
                a: { name: 'a', '@context': 'http://remotestoragejs.com/spec/modules/test/foo' },
                b: { name: 'b', '@context': 'http://remotestoragejs.com/spec/modules/test/foo' }
              });
            });
        }
      }


    ]
  });
  return suites;
});
