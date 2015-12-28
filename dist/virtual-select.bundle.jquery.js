"format global";
(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  var getOwnPropertyDescriptor = true;
  try {
    Object.getOwnPropertyDescriptor({ a: 0 }, 'a');
  }
  catch(e) {
    getOwnPropertyDescriptor = false;
  }

  var defineProperty;
  (function () {
    try {
      if (!!Object.defineProperty({}, 'a', {}))
        defineProperty = Object.defineProperty;
    }
    catch (e) {
      defineProperty = function(obj, prop, opt) {
        try {
          obj[prop] = opt.value || opt.get.call(obj);
        }
        catch(e) {}
      }
    }
  })();

  function register(name, deps, declare) {
    if (arguments.length === 4)
      return registerDynamic.apply(this, arguments);
    doRegister(name, {
      declarative: true,
      deps: deps,
      declare: declare
    });
  }

  function registerDynamic(name, deps, executingRequire, execute) {
    doRegister(name, {
      declarative: false,
      deps: deps,
      executingRequire: executingRequire,
      execute: execute
    });
  }

  function doRegister(name, entry) {
    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry;

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }


  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;

      if (typeof name == 'object') {
        for (var p in name)
          exports[p] = name[p];
      }
      else {
        exports[name] = value;
      }

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          for (var j = 0; j < importerModule.dependencies.length; ++j) {
            if (importerModule.dependencies[j] === module) {
              importerModule.setters[j](exports);
            }
          }
        }
      }

      module.locked = false;
      return value;
    }, entry.name);

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = depEntry.esModule;
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;

    // create the esModule object, which allows ES6 named imports of dynamics
    exports = module.exports;
 
    if (exports && exports.__esModule) {
      entry.esModule = exports;
    }
    else {
      entry.esModule = {};
      
      // don't trigger getters/setters in environments that support them
      if ((typeof exports == 'object' || typeof exports == 'function') && exports !== global) {
        if (getOwnPropertyDescriptor) {
          var d;
          for (var p in exports)
            if (d = Object.getOwnPropertyDescriptor(exports, p))
              defineProperty(entry.esModule, p, d);
        }
        else {
          var hasOwnProperty = exports && exports.hasOwnProperty;
          for (var p in exports) {
            if (!hasOwnProperty || exports.hasOwnProperty(p))
              entry.esModule[p] = exports[p];
          }
         }
       }
      entry.esModule['default'] = exports;
      defineProperty(entry.esModule, '__useDefault', {
        value: true
      });
    }
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    // node core modules
    if (name.substr(0, 6) == '@node/')
      return require(name.substr(6));

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    // exported modules get __esModule defined for interop
    if (entry.declarative)
      defineProperty(entry.module.exports, '__esModule', { value: true });

    // return the defined module object
    return modules[name] = entry.declarative ? entry.module.exports : entry.esModule;
  };

  return function(mains, depNames, declare) {
    return function(formatDetect) {
      formatDetect(function(deps) {
        var System = {
          _nodeRequire: typeof require != 'undefined' && require.resolve && typeof process != 'undefined' && require,
          register: register,
          registerDynamic: registerDynamic,
          get: load, 
          set: function(name, module) {
            modules[name] = module; 
          },
          newModule: function(module) {
            return module;
          }
        };
        System.set('@empty', {});

        // register external dependencies
        for (var i = 0; i < depNames.length; i++) (function(depName, dep) {
          if (dep && dep.__esModule)
            System.register(depName, [], function(_export) {
              return {
                setters: [],
                execute: function() {
                  for (var p in dep)
                    if (p != '__esModule' && !(typeof p == 'object' && p + '' == 'Module'))
                      _export(p, dep[p]);
                }
              };
            });
          else
            System.registerDynamic(depName, [], false, function() {
              return dep;
            });
        })(depNames[i], arguments[i]);

        // register modules in this bundle
        declare(System);

        // load mains
        var firstLoad = load(mains[0]);
        if (mains.length > 1)
          for (var i = 1; i < mains.length; i++)
            load(mains[i]);

        if (firstLoad.__useDefault)
          return firstLoad['default'];
        else
          return firstLoad;
      });
    };
  };

})(typeof self != 'undefined' ? self : global)
/* (['mainModule'], ['external-dep'], function($__System) {
  System.register(...);
})
(function(factory) {
  if (typeof define && define.amd)
    define(['external-dep'], factory);
  // etc UMD / module pattern
})*/

(["1"], [], function($__System) {

(function() {
  var loader = $__System;
  
  if (typeof window != 'undefined' && typeof document != 'undefined' && window.location)
    var windowOrigin = location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '');

  loader.set('@@cjs-helpers', loader.newModule({
    getPathVars: function(moduleId) {
      // remove any plugin syntax
      var pluginIndex = moduleId.lastIndexOf('!');
      var filename;
      if (pluginIndex != -1)
        filename = moduleId.substr(0, pluginIndex);
      else
        filename = moduleId;

      var dirname = filename.split('/');
      dirname.pop();
      dirname = dirname.join('/');

      if (filename.substr(0, 8) == 'file:///') {
        filename = filename.substr(7);
        dirname = dirname.substr(7);

        // on windows remove leading '/'
        if (isWindows) {
          filename = filename.substr(1);
          dirname = dirname.substr(1);
        }
      }
      else if (windowOrigin && filename.substr(0, windowOrigin.length) === windowOrigin) {
        filename = filename.substr(windowOrigin.length);
        dirname = dirname.substr(windowOrigin.length);
      }

      return {
        filename: filename,
        dirname: dirname
      };
    }
  }));
})();

$__System.registerDynamic("2", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3", ["4", "5"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = $__require('4'),
      defined = $__require('5');
  module.exports = function(TO_STRING) {
    return function(that, pos) {
      var s = String(defined(that)),
          i = toInteger(pos),
          l = s.length,
          a,
          b;
      if (i < 0 || i >= l)
        return TO_STRING ? '' : undefined;
      a = s.charCodeAt(i);
      return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("6", ["3", "7"], true, function($__require, exports, module) {
  "use strict";
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $at = $__require('3')(true);
  $__require('7')(String, 'String', function(iterated) {
    this._t = String(iterated);
    this._i = 0;
  }, function() {
    var O = this._t,
        index = this._i,
        point;
    if (index >= O.length)
      return {
        value: undefined,
        done: true
      };
    point = $at(O, index);
    this._i += point.length;
    return {
      value: point,
      done: false
    };
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("8", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function() {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("9", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(done, value) {
    return {
      value: value,
      done: !!done
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("a", ["b"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = $__require('b');
  module.exports = Object('z').propertyIsEnumerable(0) ? Object : function(it) {
    return cof(it) == 'String' ? it.split('') : Object(it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("c", ["a", "5"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var IObject = $__require('a'),
      defined = $__require('5');
  module.exports = function(it) {
    return IObject(defined(it));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("d", ["e", "f", "10", "11", "12"], true, function($__require, exports, module) {
  "use strict";
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = $__require('e'),
      descriptor = $__require('f'),
      setToStringTag = $__require('10'),
      IteratorPrototype = {};
  $__require('11')(IteratorPrototype, $__require('12')('iterator'), function() {
    return this;
  });
  module.exports = function(Constructor, NAME, next) {
    Constructor.prototype = $.create(IteratorPrototype, {next: descriptor(1, next)});
    setToStringTag(Constructor, NAME + ' Iterator');
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("7", ["13", "14", "15", "11", "16", "17", "d", "10", "e", "12"], true, function($__require, exports, module) {
  "use strict";
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var LIBRARY = $__require('13'),
      $export = $__require('14'),
      redefine = $__require('15'),
      hide = $__require('11'),
      has = $__require('16'),
      Iterators = $__require('17'),
      $iterCreate = $__require('d'),
      setToStringTag = $__require('10'),
      getProto = $__require('e').getProto,
      ITERATOR = $__require('12')('iterator'),
      BUGGY = !([].keys && 'next' in [].keys()),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values';
  var returnThis = function() {
    return this;
  };
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCED) {
    $iterCreate(Constructor, NAME, next);
    var getMethod = function(kind) {
      if (!BUGGY && kind in proto)
        return proto[kind];
      switch (kind) {
        case KEYS:
          return function keys() {
            return new Constructor(this, kind);
          };
        case VALUES:
          return function values() {
            return new Constructor(this, kind);
          };
      }
      return function entries() {
        return new Constructor(this, kind);
      };
    };
    var TAG = NAME + ' Iterator',
        DEF_VALUES = DEFAULT == VALUES,
        VALUES_BUG = false,
        proto = Base.prototype,
        $native = proto[ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
        $default = $native || getMethod(DEFAULT),
        methods,
        key;
    if ($native) {
      var IteratorPrototype = getProto($default.call(new Base));
      setToStringTag(IteratorPrototype, TAG, true);
      if (!LIBRARY && has(proto, FF_ITERATOR))
        hide(IteratorPrototype, ITERATOR, returnThis);
      if (DEF_VALUES && $native.name !== VALUES) {
        VALUES_BUG = true;
        $default = function values() {
          return $native.call(this);
        };
      }
    }
    if ((!LIBRARY || FORCED) && (BUGGY || VALUES_BUG || !proto[ITERATOR])) {
      hide(proto, ITERATOR, $default);
    }
    Iterators[NAME] = $default;
    Iterators[TAG] = returnThis;
    if (DEFAULT) {
      methods = {
        values: DEF_VALUES ? $default : getMethod(VALUES),
        keys: IS_SET ? $default : getMethod(KEYS),
        entries: !DEF_VALUES ? $default : getMethod('entries')
      };
      if (FORCED)
        for (key in methods) {
          if (!(key in proto))
            redefine(proto, key, methods[key]);
        }
      else
        $export($export.P + $export.F * (BUGGY || VALUES_BUG), NAME, methods);
    }
    return methods;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("18", ["8", "9", "17", "c", "7"], true, function($__require, exports, module) {
  "use strict";
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var addToUnscopables = $__require('8'),
      step = $__require('9'),
      Iterators = $__require('17'),
      toIObject = $__require('c');
  module.exports = $__require('7')(Array, 'Array', function(iterated, kind) {
    this._t = toIObject(iterated);
    this._i = 0;
    this._k = kind;
  }, function() {
    var O = this._t,
        kind = this._k,
        index = this._i++;
    if (!O || index >= O.length) {
      this._t = undefined;
      return step(1);
    }
    if (kind == 'keys')
      return step(0, index);
    if (kind == 'values')
      return step(0, O[index]);
    return step(0, [index, O[index]]);
  }, 'values');
  Iterators.Arguments = Iterators.Array;
  addToUnscopables('keys');
  addToUnscopables('values');
  addToUnscopables('entries');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("19", ["18", "17"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  $__require('18');
  var Iterators = $__require('17');
  Iterators.NodeList = Iterators.HTMLCollection = Iterators.Array;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("13", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("14", ["1a", "1b", "1c"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = $__require('1a'),
      core = $__require('1b'),
      ctx = $__require('1c'),
      PROTOTYPE = 'prototype';
  var $export = function(type, name, source) {
    var IS_FORCED = type & $export.F,
        IS_GLOBAL = type & $export.G,
        IS_STATIC = type & $export.S,
        IS_PROTO = type & $export.P,
        IS_BIND = type & $export.B,
        IS_WRAP = type & $export.W,
        exports = IS_GLOBAL ? core : core[name] || (core[name] = {}),
        target = IS_GLOBAL ? global : IS_STATIC ? global[name] : (global[name] || {})[PROTOTYPE],
        key,
        own,
        out;
    if (IS_GLOBAL)
      source = name;
    for (key in source) {
      own = !IS_FORCED && target && key in target;
      if (own && key in exports)
        continue;
      out = own ? target[key] : source[key];
      exports[key] = IS_GLOBAL && typeof target[key] != 'function' ? source[key] : IS_BIND && own ? ctx(out, global) : IS_WRAP && target[key] == out ? (function(C) {
        var F = function(param) {
          return this instanceof C ? new C(param) : C(param);
        };
        F[PROTOTYPE] = C[PROTOTYPE];
        return F;
      })(out) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
      if (IS_PROTO)
        (exports[PROTOTYPE] || (exports[PROTOTYPE] = {}))[key] = out;
    }
  };
  $export.F = 1;
  $export.G = 2;
  $export.S = 4;
  $export.P = 8;
  $export.B = 16;
  $export.W = 32;
  module.exports = $export;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1d", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it, Constructor, name) {
    if (!(it instanceof Constructor))
      throw TypeError(name + ": use the 'new' operator!");
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1e", ["1f"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var anObject = $__require('1f');
  module.exports = function(iterator, fn, value, entries) {
    try {
      return entries ? fn(anObject(value)[0], value[1]) : fn(value);
    } catch (e) {
      var ret = iterator['return'];
      if (ret !== undefined)
        anObject(ret.call(iterator));
      throw e;
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("20", ["17", "12"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var Iterators = $__require('17'),
      ITERATOR = $__require('12')('iterator'),
      ArrayProto = Array.prototype;
  module.exports = function(it) {
    return it !== undefined && (Iterators.Array === it || ArrayProto[ITERATOR] === it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ceil = Math.ceil,
      floor = Math.floor;
  module.exports = function(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("21", ["4"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = $__require('4'),
      min = Math.min;
  module.exports = function(it) {
    return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("22", ["b", "12"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = $__require('b'),
      TAG = $__require('12')('toStringTag'),
      ARG = cof(function() {
        return arguments;
      }()) == 'Arguments';
  module.exports = function(it) {
    var O,
        T,
        B;
    return it === undefined ? 'Undefined' : it === null ? 'Null' : typeof(T = (O = Object(it))[TAG]) == 'string' ? T : ARG ? cof(O) : (B = cof(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : B;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("17", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("23", ["22", "12", "17", "1b"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var classof = $__require('22'),
      ITERATOR = $__require('12')('iterator'),
      Iterators = $__require('17');
  module.exports = $__require('1b').getIteratorMethod = function(it) {
    if (it != undefined)
      return it[ITERATOR] || it['@@iterator'] || Iterators[classof(it)];
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("24", ["1c", "1e", "20", "1f", "21", "23"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ctx = $__require('1c'),
      call = $__require('1e'),
      isArrayIter = $__require('20'),
      anObject = $__require('1f'),
      toLength = $__require('21'),
      getIterFn = $__require('23');
  module.exports = function(iterable, entries, fn, that) {
    var iterFn = getIterFn(iterable),
        f = ctx(fn, that, entries ? 2 : 1),
        index = 0,
        length,
        step,
        iterator;
    if (typeof iterFn != 'function')
      throw TypeError(iterable + ' is not iterable!');
    if (isArrayIter(iterFn))
      for (length = toLength(iterable.length); length > index; index++) {
        entries ? f(anObject(step = iterable[index])[0], step[1]) : f(iterable[index]);
      }
    else
      for (iterator = iterFn.call(iterable); !(step = iterator.next()).done; ) {
        call(iterator, f, step.value, entries);
      }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("25", ["e", "26", "1f", "1c"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var getDesc = $__require('e').getDesc,
      isObject = $__require('26'),
      anObject = $__require('1f');
  var check = function(O, proto) {
    anObject(O);
    if (!isObject(proto) && proto !== null)
      throw TypeError(proto + ": can't set as prototype!");
  };
  module.exports = {
    set: Object.setPrototypeOf || ('__proto__' in {} ? function(test, buggy, set) {
      try {
        set = $__require('1c')(Function.call, getDesc(Object.prototype, '__proto__').set, 2);
        set(test, []);
        buggy = !(test instanceof Array);
      } catch (e) {
        buggy = true;
      }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy)
          O.__proto__ = proto;
        else
          set(O, proto);
        return O;
      };
    }({}, false) : undefined),
    check: check
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("27", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = Object.is || function is(x, y) {
    return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1f", ["26"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var isObject = $__require('26');
  module.exports = function(it) {
    if (!isObject(it))
      throw TypeError(it + ' is not an object!');
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("28", ["1f", "29", "12"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var anObject = $__require('1f'),
      aFunction = $__require('29'),
      SPECIES = $__require('12')('species');
  module.exports = function(O, D) {
    var C = anObject(O).constructor,
        S;
    return C === undefined || (S = anObject(C)[SPECIES]) == undefined ? D : aFunction(S);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("29", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    if (typeof it != 'function')
      throw TypeError(it + ' is not a function!');
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1c", ["29"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var aFunction = $__require('29');
  module.exports = function(fn, that, length) {
    aFunction(fn);
    if (that === undefined)
      return fn;
    switch (length) {
      case 1:
        return function(a) {
          return fn.call(that, a);
        };
      case 2:
        return function(a, b) {
          return fn.call(that, a, b);
        };
      case 3:
        return function(a, b, c) {
          return fn.call(that, a, b, c);
        };
    }
    return function() {
      return fn.apply(that, arguments);
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2a", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(fn, args, that) {
    var un = that === undefined;
    switch (args.length) {
      case 0:
        return un ? fn() : fn.call(that);
      case 1:
        return un ? fn(args[0]) : fn.call(that, args[0]);
      case 2:
        return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
      case 3:
        return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
      case 4:
        return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
    }
    return fn.apply(that, args);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2b", ["1a"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__require('1a').document && document.documentElement;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("26", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    return typeof it === 'object' ? it !== null : typeof it === 'function';
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2c", ["26", "1a"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var isObject = $__require('26'),
      document = $__require('1a').document,
      is = isObject(document) && isObject(document.createElement);
  module.exports = function(it) {
    return is ? document.createElement(it) : {};
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2d", ["1c", "2a", "2b", "2c", "1a", "b", "2e"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    var ctx = $__require('1c'),
        invoke = $__require('2a'),
        html = $__require('2b'),
        cel = $__require('2c'),
        global = $__require('1a'),
        process = global.process,
        setTask = global.setImmediate,
        clearTask = global.clearImmediate,
        MessageChannel = global.MessageChannel,
        counter = 0,
        queue = {},
        ONREADYSTATECHANGE = 'onreadystatechange',
        defer,
        channel,
        port;
    var run = function() {
      var id = +this;
      if (queue.hasOwnProperty(id)) {
        var fn = queue[id];
        delete queue[id];
        fn();
      }
    };
    var listner = function(event) {
      run.call(event.data);
    };
    if (!setTask || !clearTask) {
      setTask = function setImmediate(fn) {
        var args = [],
            i = 1;
        while (arguments.length > i)
          args.push(arguments[i++]);
        queue[++counter] = function() {
          invoke(typeof fn == 'function' ? fn : Function(fn), args);
        };
        defer(counter);
        return counter;
      };
      clearTask = function clearImmediate(id) {
        delete queue[id];
      };
      if ($__require('b')(process) == 'process') {
        defer = function(id) {
          process.nextTick(ctx(run, id, 1));
        };
      } else if (MessageChannel) {
        channel = new MessageChannel;
        port = channel.port2;
        channel.port1.onmessage = listner;
        defer = ctx(port.postMessage, port, 1);
      } else if (global.addEventListener && typeof postMessage == 'function' && !global.importScripts) {
        defer = function(id) {
          global.postMessage(id + '', '*');
        };
        global.addEventListener('message', listner, false);
      } else if (ONREADYSTATECHANGE in cel('script')) {
        defer = function(id) {
          html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function() {
            html.removeChild(this);
            run.call(id);
          };
        };
      } else {
        defer = function(id) {
          setTimeout(ctx(run, id, 1), 0);
        };
      }
    }
    module.exports = {
      set: setTask,
      clear: clearTask
    };
  })($__require('2e'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("b", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toString = {}.toString;
  module.exports = function(it) {
    return toString.call(it).slice(8, -1);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2f", ["1a", "2d", "b", "2e"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    var global = $__require('1a'),
        macrotask = $__require('2d').set,
        Observer = global.MutationObserver || global.WebKitMutationObserver,
        process = global.process,
        Promise = global.Promise,
        isNode = $__require('b')(process) == 'process',
        head,
        last,
        notify;
    var flush = function() {
      var parent,
          domain,
          fn;
      if (isNode && (parent = process.domain)) {
        process.domain = null;
        parent.exit();
      }
      while (head) {
        domain = head.domain;
        fn = head.fn;
        if (domain)
          domain.enter();
        fn();
        if (domain)
          domain.exit();
        head = head.next;
      }
      last = undefined;
      if (parent)
        parent.enter();
    };
    if (isNode) {
      notify = function() {
        process.nextTick(flush);
      };
    } else if (Observer) {
      var toggle = 1,
          node = document.createTextNode('');
      new Observer(flush).observe(node, {characterData: true});
      notify = function() {
        node.data = toggle = -toggle;
      };
    } else if (Promise && Promise.resolve) {
      notify = function() {
        Promise.resolve().then(flush);
      };
    } else {
      notify = function() {
        macrotask.call(global, flush);
      };
    }
    module.exports = function asap(fn) {
      var task = {
        fn: fn,
        next: undefined,
        domain: isNode && process.domain
      };
      if (last)
        last.next = task;
      if (!head) {
        head = task;
        notify();
      }
      last = task;
    };
  })($__require('2e'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("f", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("11", ["e", "f", "30"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = $__require('e'),
      createDesc = $__require('f');
  module.exports = $__require('30') ? function(object, key, value) {
    return $.setDesc(object, key, createDesc(1, value));
  } : function(object, key, value) {
    object[key] = value;
    return object;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("15", ["11"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__require('11');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("31", ["15"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var redefine = $__require('15');
  module.exports = function(target, src) {
    for (var key in src)
      redefine(target, key, src[key]);
    return target;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("16", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var hasOwnProperty = {}.hasOwnProperty;
  module.exports = function(it, key) {
    return hasOwnProperty.call(it, key);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("10", ["e", "16", "12"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var def = $__require('e').setDesc,
      has = $__require('16'),
      TAG = $__require('12')('toStringTag');
  module.exports = function(it, tag, stat) {
    if (it && !has(it = stat ? it : it.prototype, TAG))
      def(it, TAG, {
        configurable: true,
        value: tag
      });
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("32", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(exec) {
    try {
      return !!exec();
    } catch (e) {
      return true;
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("30", ["32"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = !$__require('32')(function() {
    return Object.defineProperty({}, 'a', {get: function() {
        return 7;
      }}).a != 7;
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("33", ["1b", "e", "30", "12"], true, function($__require, exports, module) {
  "use strict";
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var core = $__require('1b'),
      $ = $__require('e'),
      DESCRIPTORS = $__require('30'),
      SPECIES = $__require('12')('species');
  module.exports = function(KEY) {
    var C = core[KEY];
    if (DESCRIPTORS && C && !C[SPECIES])
      $.setDesc(C, SPECIES, {
        configurable: true,
        get: function() {
          return this;
        }
      });
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("34", ["1a"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = $__require('1a'),
      SHARED = '__core-js_shared__',
      store = global[SHARED] || (global[SHARED] = {});
  module.exports = function(key) {
    return store[key] || (store[key] = {});
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("35", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var id = 0,
      px = Math.random();
  module.exports = function(key) {
    return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1a", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = module.exports = typeof window != 'undefined' && window.Math == Math ? window : typeof self != 'undefined' && self.Math == Math ? self : Function('return this')();
  if (typeof __g == 'number')
    __g = global;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("12", ["34", "35", "1a"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var store = $__require('34')('wks'),
      uid = $__require('35'),
      Symbol = $__require('1a').Symbol;
  module.exports = function(name) {
    return store[name] || (store[name] = Symbol && Symbol[name] || (Symbol || uid)('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("36", ["12"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ITERATOR = $__require('12')('iterator'),
      SAFE_CLOSING = false;
  try {
    var riter = [7][ITERATOR]();
    riter['return'] = function() {
      SAFE_CLOSING = true;
    };
    Array.from(riter, function() {
      throw 2;
    });
  } catch (e) {}
  module.exports = function(exec, skipClosing) {
    if (!skipClosing && !SAFE_CLOSING)
      return false;
    var safe = false;
    try {
      var arr = [7],
          iter = arr[ITERATOR]();
      iter.next = function() {
        safe = true;
      };
      arr[ITERATOR] = function() {
        return iter;
      };
      exec(arr);
    } catch (e) {}
    return safe;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("37", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;
  function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
      queue = currentQueue.concat(queue);
    } else {
      queueIndex = -1;
    }
    if (queue.length) {
      drainQueue();
    }
  }
  function drainQueue() {
    if (draining) {
      return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      while (++queueIndex < len) {
        if (currentQueue) {
          currentQueue[queueIndex].run();
        }
      }
      queueIndex = -1;
      len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
  }
  process.nextTick = function(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        args[i - 1] = arguments[i];
      }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
      setTimeout(drainQueue, 0);
    }
  };
  function Item(fun, array) {
    this.fun = fun;
    this.array = array;
  }
  Item.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  process.versions = {};
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("38", ["37"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__require('37');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("39", ["38"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__System._nodeRequire ? process : $__require('38');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2e", ["39"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__require('39');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3a", ["e", "13", "1a", "1c", "22", "14", "26", "1f", "29", "1d", "24", "25", "27", "12", "28", "2f", "30", "31", "10", "33", "1b", "36", "2e"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = $__require('e'),
        LIBRARY = $__require('13'),
        global = $__require('1a'),
        ctx = $__require('1c'),
        classof = $__require('22'),
        $export = $__require('14'),
        isObject = $__require('26'),
        anObject = $__require('1f'),
        aFunction = $__require('29'),
        strictNew = $__require('1d'),
        forOf = $__require('24'),
        setProto = $__require('25').set,
        same = $__require('27'),
        SPECIES = $__require('12')('species'),
        speciesConstructor = $__require('28'),
        asap = $__require('2f'),
        PROMISE = 'Promise',
        process = global.process,
        isNode = classof(process) == 'process',
        P = global[PROMISE],
        Wrapper;
    var testResolve = function(sub) {
      var test = new P(function() {});
      if (sub)
        test.constructor = Object;
      return P.resolve(test) === test;
    };
    var USE_NATIVE = function() {
      var works = false;
      function P2(x) {
        var self = new P(x);
        setProto(self, P2.prototype);
        return self;
      }
      try {
        works = P && P.resolve && testResolve();
        setProto(P2, P);
        P2.prototype = $.create(P.prototype, {constructor: {value: P2}});
        if (!(P2.resolve(5).then(function() {}) instanceof P2)) {
          works = false;
        }
        if (works && $__require('30')) {
          var thenableThenGotten = false;
          P.resolve($.setDesc({}, 'then', {get: function() {
              thenableThenGotten = true;
            }}));
          works = thenableThenGotten;
        }
      } catch (e) {
        works = false;
      }
      return works;
    }();
    var sameConstructor = function(a, b) {
      if (LIBRARY && a === P && b === Wrapper)
        return true;
      return same(a, b);
    };
    var getConstructor = function(C) {
      var S = anObject(C)[SPECIES];
      return S != undefined ? S : C;
    };
    var isThenable = function(it) {
      var then;
      return isObject(it) && typeof(then = it.then) == 'function' ? then : false;
    };
    var PromiseCapability = function(C) {
      var resolve,
          reject;
      this.promise = new C(function($$resolve, $$reject) {
        if (resolve !== undefined || reject !== undefined)
          throw TypeError('Bad Promise constructor');
        resolve = $$resolve;
        reject = $$reject;
      });
      this.resolve = aFunction(resolve), this.reject = aFunction(reject);
    };
    var perform = function(exec) {
      try {
        exec();
      } catch (e) {
        return {error: e};
      }
    };
    var notify = function(record, isReject) {
      if (record.n)
        return;
      record.n = true;
      var chain = record.c;
      asap(function() {
        var value = record.v,
            ok = record.s == 1,
            i = 0;
        var run = function(reaction) {
          var handler = ok ? reaction.ok : reaction.fail,
              resolve = reaction.resolve,
              reject = reaction.reject,
              result,
              then;
          try {
            if (handler) {
              if (!ok)
                record.h = true;
              result = handler === true ? value : handler(value);
              if (result === reaction.promise) {
                reject(TypeError('Promise-chain cycle'));
              } else if (then = isThenable(result)) {
                then.call(result, resolve, reject);
              } else
                resolve(result);
            } else
              reject(value);
          } catch (e) {
            reject(e);
          }
        };
        while (chain.length > i)
          run(chain[i++]);
        chain.length = 0;
        record.n = false;
        if (isReject)
          setTimeout(function() {
            var promise = record.p,
                handler,
                console;
            if (isUnhandled(promise)) {
              if (isNode) {
                process.emit('unhandledRejection', value, promise);
              } else if (handler = global.onunhandledrejection) {
                handler({
                  promise: promise,
                  reason: value
                });
              } else if ((console = global.console) && console.error) {
                console.error('Unhandled promise rejection', value);
              }
            }
            record.a = undefined;
          }, 1);
      });
    };
    var isUnhandled = function(promise) {
      var record = promise._d,
          chain = record.a || record.c,
          i = 0,
          reaction;
      if (record.h)
        return false;
      while (chain.length > i) {
        reaction = chain[i++];
        if (reaction.fail || !isUnhandled(reaction.promise))
          return false;
      }
      return true;
    };
    var $reject = function(value) {
      var record = this;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      record.v = value;
      record.s = 2;
      record.a = record.c.slice();
      notify(record, true);
    };
    var $resolve = function(value) {
      var record = this,
          then;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      try {
        if (record.p === value)
          throw TypeError("Promise can't be resolved itself");
        if (then = isThenable(value)) {
          asap(function() {
            var wrapper = {
              r: record,
              d: false
            };
            try {
              then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
            } catch (e) {
              $reject.call(wrapper, e);
            }
          });
        } else {
          record.v = value;
          record.s = 1;
          notify(record, false);
        }
      } catch (e) {
        $reject.call({
          r: record,
          d: false
        }, e);
      }
    };
    if (!USE_NATIVE) {
      P = function Promise(executor) {
        aFunction(executor);
        var record = this._d = {
          p: strictNew(this, P, PROMISE),
          c: [],
          a: undefined,
          s: 0,
          d: false,
          v: undefined,
          h: false,
          n: false
        };
        try {
          executor(ctx($resolve, record, 1), ctx($reject, record, 1));
        } catch (err) {
          $reject.call(record, err);
        }
      };
      $__require('31')(P.prototype, {
        then: function then(onFulfilled, onRejected) {
          var reaction = new PromiseCapability(speciesConstructor(this, P)),
              promise = reaction.promise,
              record = this._d;
          reaction.ok = typeof onFulfilled == 'function' ? onFulfilled : true;
          reaction.fail = typeof onRejected == 'function' && onRejected;
          record.c.push(reaction);
          if (record.a)
            record.a.push(reaction);
          if (record.s)
            notify(record, false);
          return promise;
        },
        'catch': function(onRejected) {
          return this.then(undefined, onRejected);
        }
      });
    }
    $export($export.G + $export.W + $export.F * !USE_NATIVE, {Promise: P});
    $__require('10')(P, PROMISE);
    $__require('33')(PROMISE);
    Wrapper = $__require('1b')[PROMISE];
    $export($export.S + $export.F * !USE_NATIVE, PROMISE, {reject: function reject(r) {
        var capability = new PromiseCapability(this),
            $$reject = capability.reject;
        $$reject(r);
        return capability.promise;
      }});
    $export($export.S + $export.F * (!USE_NATIVE || testResolve(true)), PROMISE, {resolve: function resolve(x) {
        if (x instanceof P && sameConstructor(x.constructor, this))
          return x;
        var capability = new PromiseCapability(this),
            $$resolve = capability.resolve;
        $$resolve(x);
        return capability.promise;
      }});
    $export($export.S + $export.F * !(USE_NATIVE && $__require('36')(function(iter) {
      P.all(iter)['catch'](function() {});
    })), PROMISE, {
      all: function all(iterable) {
        var C = getConstructor(this),
            capability = new PromiseCapability(C),
            resolve = capability.resolve,
            reject = capability.reject,
            values = [];
        var abrupt = perform(function() {
          forOf(iterable, false, values.push, values);
          var remaining = values.length,
              results = Array(remaining);
          if (remaining)
            $.each.call(values, function(promise, index) {
              var alreadyCalled = false;
              C.resolve(promise).then(function(value) {
                if (alreadyCalled)
                  return;
                alreadyCalled = true;
                results[index] = value;
                --remaining || resolve(results);
              }, reject);
            });
          else
            resolve(results);
        });
        if (abrupt)
          reject(abrupt.error);
        return capability.promise;
      },
      race: function race(iterable) {
        var C = getConstructor(this),
            capability = new PromiseCapability(C),
            reject = capability.reject;
        var abrupt = perform(function() {
          forOf(iterable, false, function(promise) {
            C.resolve(promise).then(capability.resolve, reject);
          });
        });
        if (abrupt)
          reject(abrupt.error);
        return capability.promise;
      }
    });
  })($__require('2e'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1b", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var core = module.exports = {version: '1.2.6'};
  if (typeof __e == 'number')
    __e = core;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3b", ["2", "6", "19", "3a", "1b"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  $__require('2');
  $__require('6');
  $__require('19');
  $__require('3a');
  module.exports = $__require('1b').Promise;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3c", ["3b"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": $__require('3b'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.register('3d', ['3e'], function (_export) {
  'use strict';

  var $, actions;

  function startSelection(state, _ref) {
    var dataProvider = _ref.dataProvider;
    var items = dataProvider.availableItems;

    var selectedItemIndex = state.selectedItem ? items.findIndex(function (item) {
      return dataProvider.identity(item) === dataProvider.identity(state.selectedItem);
    }) : -1;
    return $.extend({}, state, {
      open: true,
      activeItemIndex: selectedItemIndex >= 0 ? selectedItemIndex : 0,
      selectedItemIndex: selectedItemIndex
    });
  }

  function activatePreviousItem(state) {
    return $.extend({}, state, {
      activeItemIndex: Math.max(state.activeItemIndex - 1, 0)
    });
  }

  function activateNextItem(state, options) {
    return $.extend({}, state, {
      activeItemIndex: Math.min(state.activeItemIndex + 1, options.dataProvider.items.length - 1)
    });
  }

  function activateItemAtIndex(state, options, index) {
    return $.extend({}, state, {
      activeItemIndex: index
    });
  }

  function cancelSelection(state, options) {
    var targetState = changeQuery(state, options, '');
    targetState.open = false;
    return targetState;
  }

  function selectItemAtIndex(state, options, index) {
    var selectedItem = options.dataProvider.items[index];

    // the index must be adjusted to represent the item in the availableItems array
    var selectedItemIndex = selectedItem ? options.dataProvider.availableItems.findIndex(function (item) {
      return options.dataProvider.identity(item) === options.dataProvider.identity(selectedItem);
    }) : -1;

    var targetState = cancelSelection(state, options);
    targetState.selectedItem = selectedItem;
    targetState.selectedItemIndex = selectedItemIndex;
    return targetState;
  }

  function selectActiveItem(state, options) {
    var index = state.activeItemIndex;
    return selectItemAtIndex(state, options, index);
  }

  function toggleExtendedMode(state) {
    return $.extend({}, state, {
      extendedModeEnabled: !state.extendedModeEnabled
    });
  }

  function changeQuery(state, options, query) {
    if (query !== state.query) {
      options.dataProvider.filter(query);
      return $.extend({}, state, {
        query: query,
        activeItemIndex: 0
      });
    } else {
      return state;
    }
  }

  function startLoading(state) {
    return $.extend({}, state, {
      itemsLoading: true
    });
  }

  function finishLoading(state) {
    return $.extend({}, state, {
      itemsLoading: false,
      itemsLoaded: true
    });
  }

  return {
    setters: [function (_e) {
      $ = _e['default'];
    }],
    execute: function () {
      actions = {
        startSelection: startSelection,
        cancelSelection: cancelSelection,
        changeQuery: changeQuery,
        activateItemAtIndex: activateItemAtIndex,
        activatePreviousItem: activatePreviousItem,
        activateNextItem: activateNextItem,
        selectItemAtIndex: selectItemAtIndex,
        selectActiveItem: selectActiveItem,
        toggleExtendedMode: toggleExtendedMode,
        startLoading: startLoading,
        finishLoading: finishLoading
      };

      _export('default', actions);
    }
  };
});
$__System.register('3f', ['3e'], function (_export) {
  'use strict';

  var $;

  function Container(options) {
    this.options = options;
    this.init();
  }

  return {
    setters: [function (_e) {
      $ = _e['default'];
    }],
    execute: function () {
      Container.prototype.init = function () {
        this.element = this.$container = $('<div/>').addClass('ui-virtual-select');
      };

      Container.prototype.render = function (state) {

        // toggle loading indicator and class
        if (state.itemsLoading) {
          this.$container.addClass('loading');
        } else {
          this.$container.removeClass('loading');
        }

        // toggle open state and class
        if (state.open) {
          this.$container.addClass('open');
        } else {
          this.$container.removeClass('open');
        }
      };

      _export('default', Container);
    }
  };
});
$__System.register('40', ['3e'], function (_export) {
  'use strict';

  var $;

  function LoadingIndicator(options) {
    this.options = options;
    this.renderedState = {};
    this.init();
  }

  return {
    setters: [function (_e) {
      $ = _e['default'];
    }],
    execute: function () {
      LoadingIndicator.prototype.init = function () {
        this.element = this.$loadingIndicator = $('<div/>').addClass('ui-virtual-select--loading-indicator').text('Loading...').hide();
      };

      LoadingIndicator.prototype.render = function (state) {

        // toggle loading indicator and class
        if (state.itemsLoading) {
          this.$loadingIndicator.show();
        } else {
          this.$loadingIndicator.hide();
        }

        // this.renderedState = state;
        this.renderedState = $.extend({}, state);
      };

      _export('default', LoadingIndicator);
    }
  };
});
$__System.registerDynamic("e", [], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $Object = Object;
  module.exports = {
    create: $Object.create,
    getProto: $Object.getPrototypeOf,
    isEnum: {}.propertyIsEnumerable,
    getDesc: $Object.getOwnPropertyDescriptor,
    setDesc: $Object.defineProperty,
    setDescs: $Object.defineProperties,
    getKeys: $Object.keys,
    getNames: $Object.getOwnPropertyNames,
    getSymbols: $Object.getOwnPropertySymbols,
    each: [].forEach
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("41", ["e"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = $__require('e');
  module.exports = function defineProperty(it, key, desc) {
    return $.setDesc(it, key, desc);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("42", ["41"], true, function($__require, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": $__require('41'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("43", ["42"], true, function($__require, exports, module) {
  "use strict";
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var _Object$defineProperty = $__require('42')["default"];
  exports["default"] = function(obj, key, value) {
    if (key in obj) {
      _Object$defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }
    return obj;
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

$__System.register("44", [], function (_export) {
  "use strict";

  var CursorUp, CursorDown, Enter, Escape, Control;
  return {
    setters: [],
    execute: function () {
      CursorUp = 38;

      _export("CursorUp", CursorUp);

      CursorDown = 40;

      _export("CursorDown", CursorDown);

      Enter = 13;

      _export("Enter", Enter);

      Escape = 27;

      _export("Escape", Escape);

      Control = 17;

      _export("Control", Control);
    }
  };
});
$__System.register('45', ['43', '44', '46', '3e'], function (_export) {
  var _defineProperty, CursorUp, CursorDown, Escape, Enter, Control, noop, $;

  function SearchInput(options) {
    this.options = options;
    this.channels = {
      'focus': noop,
      'blur': noop,
      'change': noop,
      'activate_next_item': noop,
      'activate_previous_item': noop,
      'select_active_item': noop,
      'cancel_selection': noop,
      'toggle_extended_mode': noop
    };
    this.renderedState = {};
    this.init();
  }

  return {
    setters: [function (_) {
      _defineProperty = _['default'];
    }, function (_2) {
      CursorUp = _2.CursorUp;
      CursorDown = _2.CursorDown;
      Escape = _2.Escape;
      Enter = _2.Enter;
      Control = _2.Control;
    }, function (_3) {
      noop = _3['default'];
    }, function (_e) {
      $ = _e['default'];
    }],
    execute: function () {
      'use strict';

      SearchInput.prototype.on = function (channel, callback) {
        this.channels[channel] = callback ? callback : noop;
        return this;
      };

      SearchInput.prototype.init = function () {
        var _keydownHandlers,
            _this = this;

        var keydownHandlers = (_keydownHandlers = {}, _defineProperty(_keydownHandlers, CursorUp, 'activate_previous_item'), _defineProperty(_keydownHandlers, CursorDown, 'activate_next_item'), _defineProperty(_keydownHandlers, Enter, 'select_active_item'), _defineProperty(_keydownHandlers, Escape, 'cancel_selection'), _defineProperty(_keydownHandlers, Control, 'toggle_extended_mode'), _keydownHandlers);

        this.element = this.$searchInputElement = $('<input type="text"/>').addClass('ui-virtual-select--search-input').on('focus', function () {
          _this.channels['focus']();
        }).on('keydown', function (event) {
          var key = event.which;
          var channel = keydownHandlers[key];
          if (channel) {
            _this.channels[channel]();
          }
        }).on('blur', function () {
          _this.channels['blur']();
        }).on('keyup', function (event) {
          var query = $(event.target).val();
          _this.channels['change'](query);
        });
      };

      SearchInput.prototype.render = function (state) {

        // update placeholder
        var dataProvider = this.options.dataProvider;
        var displayText = state.selectedItem ? dataProvider.displayText(state.selectedItem) : dataProvider.noSelectionText();
        if (displayText !== this.$searchInputElement.attr('placeholder')) {
          console.debug('updating placeholder: ' + displayText);
          this.$searchInputElement.attr('placeholder', displayText);
        }

        // update value
        if (state.query !== this.$searchInputElement.val()) {
          console.debug('updating query: ' + state.query);
          this.$searchInputElement.val(state.query);
        }

        if (this.$searchInputElement.is(':focus') && !state.open && this.renderedState.open) {
          console.debug('blurring search input');
          this.$searchInputElement.trigger('blur');
        }

        // this.renderedState = state;
        this.renderedState = $.extend({}, state);
      };

      _export('default', SearchInput);
    }
  };
});
$__System.register("3e", [], function (_export) {
  "use strict";

  return {
    setters: [],
    execute: function () {
      _export("default", window.jQuery);
    }
  };
});
$__System.register("46", [], function (_export) {
  "use strict";

  function noop() {}

  return {
    setters: [],
    execute: function () {
      _export("default", noop);
    }
  };
});
$__System.register('47', ['46', '3e'], function (_export) {
  'use strict';

  var noop, $;

  function OptionList(options) {
    this.options = options;
    this.channels = {
      select: noop,
      activate: noop
    };
    this.lastMouseX = NaN;
    this.lastMouseY = NaN;
    this.init();
  }

  return {
    setters: [function (_2) {
      noop = _2['default'];
    }, function (_e) {
      $ = _e['default'];
    }],
    execute: function () {
      OptionList.prototype.onlyIfMousePositionChanged = function (callback) {
        var _this = this;

        return function (event) {
          // workaround to prevent scripted scrolling from triggering mousemove events
          var previousX = _this.lastMouseX;
          var previousY = _this.lastMouseY;
          var currentX = event.pageX;
          var currentY = event.pageY;

          return currentX !== previousX || currentY !== previousY ? callback(event) : noop();
        };
      };

      OptionList.prototype.on = function (channel, callback) {
        this.channels[channel] = callback ? callback : noop;
        return this;
      };

      OptionList.prototype.init = function () {
        var _this2 = this;

        var $items = $('<div/>').addClass('ui-virtual-select--items').css('overflow-y', 'scroll').on('scroll', _.throttle(function () {
          _this2.render();
        }, 10)).on('mousemove', function (event) {
          _this2.lastMouseX = event.pageX;
          _this2.lastMouseY = event.pageY;
        }).on('mousedown', function (event) {
          /* prevent blur event when clicking options */
          if ($.contains($items.get(0), event.target)) {
            console.log('preventing default');
            event.preventDefault();
          }
        }).hide();

        var $canvas = $('<div/>').addClass('ui-virtual-select--canvas').appendTo($items).on('mousemove', '.ui-virtual-select--item', this.onlyIfMousePositionChanged(function (event) {
          var index = $(event.currentTarget).data('index');
          if (index !== _this2.renderedState.activeItemIndex) {
            _this2.channels['activate'](index);
          }
        })).on('click', '.ui-virtual-select--item', function (event) {
          var index = $(event.currentTarget).data('index');
          _this2.channels['select'](index);
        });

        this.element = this.$items = $items;
        this.$canvas = $canvas;
      };

      OptionList.prototype.render = function (state) {
        var _this3 = this;

        var self = this;

        if (arguments.length === 0) {
          state = this.renderedState;
        }

        // toggle open state and class
        if (state.open) {
          this.$items.show();
        } else {
          this.$items.hide();
        }

        if (state.open) {
          (function () {

            // adjust first item
            var scrollPosition = _this3.$items.scrollTop();
            var firstRenderedItemIndex = Math.max(Math.floor(scrollPosition / _this3.options.itemHeight) - _this3.options.maxVisibleItems, 0);

            // update items height
            var itemsElementHeight = Math.min(_this3.options.maxVisibleItems, _this3.options.dataProvider.items.length) * _this3.options.itemHeight;
            _this3.$items.css({
              height: itemsElementHeight + 'px'
            });

            // update canvas size
            var firstVisibleItemIndex = Math.max(Math.floor(_this3.$items.scrollTop() / _this3.options.itemHeight) - _this3.options.maxVisibleItems, 0);
            var canvasElementMarginTop = firstVisibleItemIndex * _this3.options.itemHeight;
            var canvasElementHeight = _this3.options.dataProvider.items.length * _this3.options.itemHeight - firstVisibleItemIndex * _this3.options.itemHeight;
            _this3.$canvas.css({
              'height': canvasElementHeight + 'px',
              'margin-top': canvasElementMarginTop + 'px'
            });

            // adjust scroll position
            if (state.activeItemIndex !== _this3.renderedState.activeItemIndex || !_this3.renderedState.open) {
              var canvasSize = Math.min(_this3.options.dataProvider.items.length, _this3.options.maxVisibleItems) * _this3.options.itemHeight;
              var targetScrollPosition = state.activeItemIndex * _this3.options.itemHeight;
              var a1 = Math.ceil(scrollPosition / _this3.options.itemHeight) * _this3.options.itemHeight;
              var a2 = Math.floor(scrollPosition / _this3.options.itemHeight) * _this3.options.itemHeight + canvasSize;
              if (targetScrollPosition <= a1 || !_this3.renderedState.open) {
                _this3.$items.scrollTop(targetScrollPosition);
              } else if (targetScrollPosition >= a2) {
                _this3.$items.scrollTop(targetScrollPosition - canvasSize + _this3.options.itemHeight);
              }
            }

            // get items to render
            var items = _this3.options.dataProvider.get(firstRenderedItemIndex, firstRenderedItemIndex + _this3.options.maxRenderedItems);

            // create dom elements if necessary
            items.forEach(function (item, index) {
              var $itemElement = _this3.$canvas.children('.ui-virtual-select--item').eq(index);
              if ($itemElement.length === 0) {
                $itemElement = $('<div/>').addClass('ui-virtual-select--item').appendTo(_this3.$canvas);
              }
              // TODO Optimize?
              $itemElement.data('item', item).data('offset', firstRenderedItemIndex).data('index', firstRenderedItemIndex + index);
            });

            // remove excess dom elements
            _this3.$canvas.children('.ui-virtual-select--item').slice(items.length).remove();

            // update text
            _this3.$canvas.children('.ui-virtual-select--item').each(function () {
              var $itemElement = $(this);
              var item = $itemElement.data('item');
              var displayText = self.options.dataProvider.displayText(item, state.extendedModeEnabled);
              if ($itemElement.text() !== displayText) {
                $itemElement.text(displayText).attr('title', displayText);
              }
            });
          })();
        }

        // change active class
        this.$canvas.children('.ui-virtual-select--item').each(function () {
          var $itemElement = $(this);
          var index = $itemElement.data('index');
          var hasActiveClass = $itemElement.hasClass('active');
          if (index === state.activeItemIndex && !hasActiveClass) {
            $itemElement.addClass('active');
          }
          if (index !== state.activeItemIndex && hasActiveClass) {
            $itemElement.removeClass('active');
          }
        });

        // update state with rendered one
        // this.renderedState = state;
        this.renderedState = $.extend({}, state);
      };

      _export('default', OptionList);
    }
  };
});
$__System.register('48', ['40', '45', '47', '3c', '3e', '3d', '3f'], function (_export) {
  var LoadingIndicator, SearchInput, OptionList, _Promise, $, fn, Container;

  function detectItemHeight() {
    var $sampleItem = $('<div/>').addClass('ui-virtual-select--item').text('Text').hide().appendTo(document.body);
    var height = $sampleItem.outerHeight();
    $sampleItem.remove();
    return height;
  }

  function VirtualSelect(document, element, userOptions) {

    var defaults = {
      itemHeight: detectItemHeight(),
      maxVisibleItems: 10,
      maxRenderedItems: 30
    };

    var options = $.extend({}, defaults, userOptions);

    var state = {
      activeItemIndex: 0,
      selectedItem: null,
      selectedItemIndex: -1,
      query: '',
      itemsLoading: false,
      itemsLoaded: false,
      open: false
    };

    (function init() {

      var containerComponent = new Container(options);

      var searchInputComponent = new SearchInput(options).on('focus', function () {
        console.log('focus');
        loadItems(state, options).then(function () {
          var targetState = fn.startSelection(state, options);
          changeState(targetState);
        });
      }).on('blur', function () {
        console.log('blur');
        var targetState = fn.cancelSelection(state, options);
        changeState(targetState);
      }).on('activate_previous_item', function () {
        console.log('activate_previous_item');
        var targetState = fn.activatePreviousItem(state, options);
        changeState(targetState);
      }).on('activate_next_item', function () {
        console.log('activate_next_item');
        var targetState = fn.activateNextItem(state, options);
        changeState(targetState);
      }).on('select_active_item', function () {
        console.log('select_active_item');
        var targetState = fn.selectActiveItem(state, options);
        changeState(targetState);
      }).on('cancel_selection', function () {
        console.log('cancel_selection');
        var targetState = fn.cancelSelection(state, options);
        changeState(targetState);
      }).on('toggle_extended_mode', function () {
        console.log('toggle_extended_mode');
        var targetState = fn.toggleExtendedMode(state, options);
        changeState(targetState);
      }).on('change', function (query) {
        console.log('change');
        var targetState = fn.changeQuery(state, options, query);
        changeState(targetState);
      });

      var loadingIndicatorComponent = new LoadingIndicator(options);

      var optionListComponent = new OptionList(options).on('select', function (index) {
        console.log('select');
        var targetState = fn.selectItemAtIndex(state, options, index);
        changeState(targetState);
      }).on('activate', function (index) {
        console.log('activate');
        var targetState = fn.activateItemAtIndex(state, options, index);
        changeState(targetState);
      });

      var $searchInput = searchInputComponent.element;
      var $loadingIndicator = loadingIndicatorComponent.element;
      var $optionList = optionListComponent.element;
      var $container = containerComponent.element;
      $container.append($searchInput, $loadingIndicator, $optionList);
      element.empty().append($container);

      function loadItems(state, options) {
        if (state.itemsLoaded) {
          return _Promise.resolve();
        } else {
          var targetState = fn.startLoading(state);
          changeState(targetState);
          return options.dataProvider.load().then(function () {
            var targetState = fn.finishLoading(state);
            changeState(targetState);
          });
        }
      }

      function changeState(targetState) {

        // rendering the search input causes a blur event, which in return
        // triggers another rendering cycle. in order for that to work, the state
        // needs to be updated beforehand. i don't really like that, but am
        // currently out of ideas on how to fix it.
        state = targetState;

        containerComponent.render(targetState);
        loadingIndicatorComponent.render(targetState);
        optionListComponent.render(targetState);
        searchInputComponent.render(targetState);
      }

      changeState(state);
    })();
  }

  return {
    setters: [function (_) {
      LoadingIndicator = _['default'];
    }, function (_2) {
      SearchInput = _2['default'];
    }, function (_3) {
      OptionList = _3['default'];
    }, function (_c) {
      _Promise = _c['default'];
    }, function (_e) {
      $ = _e['default'];
    }, function (_d) {
      fn = _d['default'];
    }, function (_f) {
      Container = _f['default'];
    }],
    execute: function () {
      'use strict';

      _export('default', VirtualSelect);
    }
  };
});
$__System.register('1', ['48', '3e'], function (_export) {
  'use strict';

  var VirtualSelect, $, pluginName;
  return {
    setters: [function (_) {
      VirtualSelect = _['default'];
    }, function (_e) {
      $ = _e['default'];
    }],
    execute: function () {
      pluginName = 'virtualselect';

      $.fn[pluginName] = function (options) {
        return this.each(function () {
          if (!$.data(this, 'plugin_' + pluginName)) {
            $.data(this, 'plugin_' + pluginName, new VirtualSelect(window.document, $(this), options));
          }
        });
      };
    }
  };
});
})
(function(factory) {
  factory();
});
//# sourceMappingURL=virtual-select.bundle.jquery.js.map
