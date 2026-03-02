/* Bundled with esbuild */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../../node_modules/lodash/_listCacheClear.js
var require_listCacheClear = __commonJS({
  "../../../../node_modules/lodash/_listCacheClear.js"(exports, module) {
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    module.exports = listCacheClear;
  }
});

// ../../../../node_modules/lodash/eq.js
var require_eq = __commonJS({
  "../../../../node_modules/lodash/eq.js"(exports, module) {
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    module.exports = eq;
  }
});

// ../../../../node_modules/lodash/_assocIndexOf.js
var require_assocIndexOf = __commonJS({
  "../../../../node_modules/lodash/_assocIndexOf.js"(exports, module) {
    var eq = require_eq();
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    module.exports = assocIndexOf;
  }
});

// ../../../../node_modules/lodash/_listCacheDelete.js
var require_listCacheDelete = __commonJS({
  "../../../../node_modules/lodash/_listCacheDelete.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    var arrayProto = Array.prototype;
    var splice = arrayProto.splice;
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    module.exports = listCacheDelete;
  }
});

// ../../../../node_modules/lodash/_listCacheGet.js
var require_listCacheGet = __commonJS({
  "../../../../node_modules/lodash/_listCacheGet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    module.exports = listCacheGet;
  }
});

// ../../../../node_modules/lodash/_listCacheHas.js
var require_listCacheHas = __commonJS({
  "../../../../node_modules/lodash/_listCacheHas.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    module.exports = listCacheHas;
  }
});

// ../../../../node_modules/lodash/_listCacheSet.js
var require_listCacheSet = __commonJS({
  "../../../../node_modules/lodash/_listCacheSet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    module.exports = listCacheSet;
  }
});

// ../../../../node_modules/lodash/_ListCache.js
var require_ListCache = __commonJS({
  "../../../../node_modules/lodash/_ListCache.js"(exports, module) {
    var listCacheClear = require_listCacheClear();
    var listCacheDelete = require_listCacheDelete();
    var listCacheGet = require_listCacheGet();
    var listCacheHas = require_listCacheHas();
    var listCacheSet = require_listCacheSet();
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    module.exports = ListCache;
  }
});

// ../../../../node_modules/lodash/_stackClear.js
var require_stackClear = __commonJS({
  "../../../../node_modules/lodash/_stackClear.js"(exports, module) {
    var ListCache = require_ListCache();
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    module.exports = stackClear;
  }
});

// ../../../../node_modules/lodash/_stackDelete.js
var require_stackDelete = __commonJS({
  "../../../../node_modules/lodash/_stackDelete.js"(exports, module) {
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    module.exports = stackDelete;
  }
});

// ../../../../node_modules/lodash/_stackGet.js
var require_stackGet = __commonJS({
  "../../../../node_modules/lodash/_stackGet.js"(exports, module) {
    function stackGet(key) {
      return this.__data__.get(key);
    }
    module.exports = stackGet;
  }
});

// ../../../../node_modules/lodash/_stackHas.js
var require_stackHas = __commonJS({
  "../../../../node_modules/lodash/_stackHas.js"(exports, module) {
    function stackHas(key) {
      return this.__data__.has(key);
    }
    module.exports = stackHas;
  }
});

// ../../../../node_modules/lodash/_freeGlobal.js
var require_freeGlobal = __commonJS({
  "../../../../node_modules/lodash/_freeGlobal.js"(exports, module) {
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    module.exports = freeGlobal;
  }
});

// ../../../../node_modules/lodash/_root.js
var require_root = __commonJS({
  "../../../../node_modules/lodash/_root.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    module.exports = root;
  }
});

// ../../../../node_modules/lodash/_Symbol.js
var require_Symbol = __commonJS({
  "../../../../node_modules/lodash/_Symbol.js"(exports, module) {
    var root = require_root();
    var Symbol2 = root.Symbol;
    module.exports = Symbol2;
  }
});

// ../../../../node_modules/lodash/_getRawTag.js
var require_getRawTag = __commonJS({
  "../../../../node_modules/lodash/_getRawTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    module.exports = getRawTag;
  }
});

// ../../../../node_modules/lodash/_objectToString.js
var require_objectToString = __commonJS({
  "../../../../node_modules/lodash/_objectToString.js"(exports, module) {
    var objectProto = Object.prototype;
    var nativeObjectToString = objectProto.toString;
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    module.exports = objectToString;
  }
});

// ../../../../node_modules/lodash/_baseGetTag.js
var require_baseGetTag = __commonJS({
  "../../../../node_modules/lodash/_baseGetTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var getRawTag = require_getRawTag();
    var objectToString = require_objectToString();
    var nullTag = "[object Null]";
    var undefinedTag = "[object Undefined]";
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    module.exports = baseGetTag;
  }
});

// ../../../../node_modules/lodash/isObject.js
var require_isObject = __commonJS({
  "../../../../node_modules/lodash/isObject.js"(exports, module) {
    function isObject(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    module.exports = isObject;
  }
});

// ../../../../node_modules/lodash/isFunction.js
var require_isFunction = __commonJS({
  "../../../../node_modules/lodash/isFunction.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObject = require_isObject();
    var asyncTag = "[object AsyncFunction]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var proxyTag = "[object Proxy]";
    function isFunction(value) {
      if (!isObject(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    module.exports = isFunction;
  }
});

// ../../../../node_modules/lodash/_coreJsData.js
var require_coreJsData = __commonJS({
  "../../../../node_modules/lodash/_coreJsData.js"(exports, module) {
    var root = require_root();
    var coreJsData = root["__core-js_shared__"];
    module.exports = coreJsData;
  }
});

// ../../../../node_modules/lodash/_isMasked.js
var require_isMasked = __commonJS({
  "../../../../node_modules/lodash/_isMasked.js"(exports, module) {
    var coreJsData = require_coreJsData();
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    module.exports = isMasked;
  }
});

// ../../../../node_modules/lodash/_toSource.js
var require_toSource = __commonJS({
  "../../../../node_modules/lodash/_toSource.js"(exports, module) {
    var funcProto = Function.prototype;
    var funcToString = funcProto.toString;
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    module.exports = toSource;
  }
});

// ../../../../node_modules/lodash/_baseIsNative.js
var require_baseIsNative = __commonJS({
  "../../../../node_modules/lodash/_baseIsNative.js"(exports, module) {
    var isFunction = require_isFunction();
    var isMasked = require_isMasked();
    var isObject = require_isObject();
    var toSource = require_toSource();
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    module.exports = baseIsNative;
  }
});

// ../../../../node_modules/lodash/_getValue.js
var require_getValue = __commonJS({
  "../../../../node_modules/lodash/_getValue.js"(exports, module) {
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    module.exports = getValue;
  }
});

// ../../../../node_modules/lodash/_getNative.js
var require_getNative = __commonJS({
  "../../../../node_modules/lodash/_getNative.js"(exports, module) {
    var baseIsNative = require_baseIsNative();
    var getValue = require_getValue();
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    module.exports = getNative;
  }
});

// ../../../../node_modules/lodash/_Map.js
var require_Map = __commonJS({
  "../../../../node_modules/lodash/_Map.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Map2 = getNative(root, "Map");
    module.exports = Map2;
  }
});

// ../../../../node_modules/lodash/_nativeCreate.js
var require_nativeCreate = __commonJS({
  "../../../../node_modules/lodash/_nativeCreate.js"(exports, module) {
    var getNative = require_getNative();
    var nativeCreate = getNative(Object, "create");
    module.exports = nativeCreate;
  }
});

// ../../../../node_modules/lodash/_hashClear.js
var require_hashClear = __commonJS({
  "../../../../node_modules/lodash/_hashClear.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    module.exports = hashClear;
  }
});

// ../../../../node_modules/lodash/_hashDelete.js
var require_hashDelete = __commonJS({
  "../../../../node_modules/lodash/_hashDelete.js"(exports, module) {
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = hashDelete;
  }
});

// ../../../../node_modules/lodash/_hashGet.js
var require_hashGet = __commonJS({
  "../../../../node_modules/lodash/_hashGet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    module.exports = hashGet;
  }
});

// ../../../../node_modules/lodash/_hashHas.js
var require_hashHas = __commonJS({
  "../../../../node_modules/lodash/_hashHas.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    module.exports = hashHas;
  }
});

// ../../../../node_modules/lodash/_hashSet.js
var require_hashSet = __commonJS({
  "../../../../node_modules/lodash/_hashSet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    module.exports = hashSet;
  }
});

// ../../../../node_modules/lodash/_Hash.js
var require_Hash = __commonJS({
  "../../../../node_modules/lodash/_Hash.js"(exports, module) {
    var hashClear = require_hashClear();
    var hashDelete = require_hashDelete();
    var hashGet = require_hashGet();
    var hashHas = require_hashHas();
    var hashSet = require_hashSet();
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    module.exports = Hash;
  }
});

// ../../../../node_modules/lodash/_mapCacheClear.js
var require_mapCacheClear = __commonJS({
  "../../../../node_modules/lodash/_mapCacheClear.js"(exports, module) {
    var Hash = require_Hash();
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    module.exports = mapCacheClear;
  }
});

// ../../../../node_modules/lodash/_isKeyable.js
var require_isKeyable = __commonJS({
  "../../../../node_modules/lodash/_isKeyable.js"(exports, module) {
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    module.exports = isKeyable;
  }
});

// ../../../../node_modules/lodash/_getMapData.js
var require_getMapData = __commonJS({
  "../../../../node_modules/lodash/_getMapData.js"(exports, module) {
    var isKeyable = require_isKeyable();
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    module.exports = getMapData;
  }
});

// ../../../../node_modules/lodash/_mapCacheDelete.js
var require_mapCacheDelete = __commonJS({
  "../../../../node_modules/lodash/_mapCacheDelete.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = mapCacheDelete;
  }
});

// ../../../../node_modules/lodash/_mapCacheGet.js
var require_mapCacheGet = __commonJS({
  "../../../../node_modules/lodash/_mapCacheGet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    module.exports = mapCacheGet;
  }
});

// ../../../../node_modules/lodash/_mapCacheHas.js
var require_mapCacheHas = __commonJS({
  "../../../../node_modules/lodash/_mapCacheHas.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    module.exports = mapCacheHas;
  }
});

// ../../../../node_modules/lodash/_mapCacheSet.js
var require_mapCacheSet = __commonJS({
  "../../../../node_modules/lodash/_mapCacheSet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    module.exports = mapCacheSet;
  }
});

// ../../../../node_modules/lodash/_MapCache.js
var require_MapCache = __commonJS({
  "../../../../node_modules/lodash/_MapCache.js"(exports, module) {
    var mapCacheClear = require_mapCacheClear();
    var mapCacheDelete = require_mapCacheDelete();
    var mapCacheGet = require_mapCacheGet();
    var mapCacheHas = require_mapCacheHas();
    var mapCacheSet = require_mapCacheSet();
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    module.exports = MapCache;
  }
});

// ../../../../node_modules/lodash/_stackSet.js
var require_stackSet = __commonJS({
  "../../../../node_modules/lodash/_stackSet.js"(exports, module) {
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    var MapCache = require_MapCache();
    var LARGE_ARRAY_SIZE = 200;
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    module.exports = stackSet;
  }
});

// ../../../../node_modules/lodash/_Stack.js
var require_Stack = __commonJS({
  "../../../../node_modules/lodash/_Stack.js"(exports, module) {
    var ListCache = require_ListCache();
    var stackClear = require_stackClear();
    var stackDelete = require_stackDelete();
    var stackGet = require_stackGet();
    var stackHas = require_stackHas();
    var stackSet = require_stackSet();
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    module.exports = Stack;
  }
});

// ../../../../node_modules/lodash/_defineProperty.js
var require_defineProperty = __commonJS({
  "../../../../node_modules/lodash/_defineProperty.js"(exports, module) {
    var getNative = require_getNative();
    var defineProperty = (function() {
      try {
        var func = getNative(Object, "defineProperty");
        func({}, "", {});
        return func;
      } catch (e) {
      }
    })();
    module.exports = defineProperty;
  }
});

// ../../../../node_modules/lodash/_baseAssignValue.js
var require_baseAssignValue = __commonJS({
  "../../../../node_modules/lodash/_baseAssignValue.js"(exports, module) {
    var defineProperty = require_defineProperty();
    function baseAssignValue(object, key, value) {
      if (key == "__proto__" && defineProperty) {
        defineProperty(object, key, {
          "configurable": true,
          "enumerable": true,
          "value": value,
          "writable": true
        });
      } else {
        object[key] = value;
      }
    }
    module.exports = baseAssignValue;
  }
});

// ../../../../node_modules/lodash/_assignMergeValue.js
var require_assignMergeValue = __commonJS({
  "../../../../node_modules/lodash/_assignMergeValue.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var eq = require_eq();
    function assignMergeValue(object, key, value) {
      if (value !== void 0 && !eq(object[key], value) || value === void 0 && !(key in object)) {
        baseAssignValue(object, key, value);
      }
    }
    module.exports = assignMergeValue;
  }
});

// ../../../../node_modules/lodash/_createBaseFor.js
var require_createBaseFor = __commonJS({
  "../../../../node_modules/lodash/_createBaseFor.js"(exports, module) {
    function createBaseFor(fromRight) {
      return function(object, iteratee, keysFunc) {
        var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
        while (length--) {
          var key = props[fromRight ? length : ++index];
          if (iteratee(iterable[key], key, iterable) === false) {
            break;
          }
        }
        return object;
      };
    }
    module.exports = createBaseFor;
  }
});

// ../../../../node_modules/lodash/_baseFor.js
var require_baseFor = __commonJS({
  "../../../../node_modules/lodash/_baseFor.js"(exports, module) {
    var createBaseFor = require_createBaseFor();
    var baseFor = createBaseFor();
    module.exports = baseFor;
  }
});

// ../../../../node_modules/lodash/_cloneBuffer.js
var require_cloneBuffer = __commonJS({
  "../../../../node_modules/lodash/_cloneBuffer.js"(exports, module) {
    var root = require_root();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var allocUnsafe = Buffer2 ? Buffer2.allocUnsafe : void 0;
    function cloneBuffer(buffer, isDeep) {
      if (isDeep) {
        return buffer.slice();
      }
      var length = buffer.length, result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
      buffer.copy(result);
      return result;
    }
    module.exports = cloneBuffer;
  }
});

// ../../../../node_modules/lodash/_Uint8Array.js
var require_Uint8Array = __commonJS({
  "../../../../node_modules/lodash/_Uint8Array.js"(exports, module) {
    var root = require_root();
    var Uint8Array2 = root.Uint8Array;
    module.exports = Uint8Array2;
  }
});

// ../../../../node_modules/lodash/_cloneArrayBuffer.js
var require_cloneArrayBuffer = __commonJS({
  "../../../../node_modules/lodash/_cloneArrayBuffer.js"(exports, module) {
    var Uint8Array2 = require_Uint8Array();
    function cloneArrayBuffer(arrayBuffer) {
      var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
      new Uint8Array2(result).set(new Uint8Array2(arrayBuffer));
      return result;
    }
    module.exports = cloneArrayBuffer;
  }
});

// ../../../../node_modules/lodash/_cloneTypedArray.js
var require_cloneTypedArray = __commonJS({
  "../../../../node_modules/lodash/_cloneTypedArray.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    function cloneTypedArray(typedArray, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
      return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
    }
    module.exports = cloneTypedArray;
  }
});

// ../../../../node_modules/lodash/_copyArray.js
var require_copyArray = __commonJS({
  "../../../../node_modules/lodash/_copyArray.js"(exports, module) {
    function copyArray(source, array) {
      var index = -1, length = source.length;
      array || (array = Array(length));
      while (++index < length) {
        array[index] = source[index];
      }
      return array;
    }
    module.exports = copyArray;
  }
});

// ../../../../node_modules/lodash/_baseCreate.js
var require_baseCreate = __commonJS({
  "../../../../node_modules/lodash/_baseCreate.js"(exports, module) {
    var isObject = require_isObject();
    var objectCreate = Object.create;
    var baseCreate = /* @__PURE__ */ (function() {
      function object() {
      }
      return function(proto) {
        if (!isObject(proto)) {
          return {};
        }
        if (objectCreate) {
          return objectCreate(proto);
        }
        object.prototype = proto;
        var result = new object();
        object.prototype = void 0;
        return result;
      };
    })();
    module.exports = baseCreate;
  }
});

// ../../../../node_modules/lodash/_overArg.js
var require_overArg = __commonJS({
  "../../../../node_modules/lodash/_overArg.js"(exports, module) {
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    module.exports = overArg;
  }
});

// ../../../../node_modules/lodash/_getPrototype.js
var require_getPrototype = __commonJS({
  "../../../../node_modules/lodash/_getPrototype.js"(exports, module) {
    var overArg = require_overArg();
    var getPrototype = overArg(Object.getPrototypeOf, Object);
    module.exports = getPrototype;
  }
});

// ../../../../node_modules/lodash/_isPrototype.js
var require_isPrototype = __commonJS({
  "../../../../node_modules/lodash/_isPrototype.js"(exports, module) {
    var objectProto = Object.prototype;
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    module.exports = isPrototype;
  }
});

// ../../../../node_modules/lodash/_initCloneObject.js
var require_initCloneObject = __commonJS({
  "../../../../node_modules/lodash/_initCloneObject.js"(exports, module) {
    var baseCreate = require_baseCreate();
    var getPrototype = require_getPrototype();
    var isPrototype = require_isPrototype();
    function initCloneObject(object) {
      return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
    }
    module.exports = initCloneObject;
  }
});

// ../../../../node_modules/lodash/isObjectLike.js
var require_isObjectLike = __commonJS({
  "../../../../node_modules/lodash/isObjectLike.js"(exports, module) {
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    module.exports = isObjectLike;
  }
});

// ../../../../node_modules/lodash/_baseIsArguments.js
var require_baseIsArguments = __commonJS({
  "../../../../node_modules/lodash/_baseIsArguments.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    module.exports = baseIsArguments;
  }
});

// ../../../../node_modules/lodash/isArguments.js
var require_isArguments = __commonJS({
  "../../../../node_modules/lodash/isArguments.js"(exports, module) {
    var baseIsArguments = require_baseIsArguments();
    var isObjectLike = require_isObjectLike();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    module.exports = isArguments;
  }
});

// ../../../../node_modules/lodash/isArray.js
var require_isArray = __commonJS({
  "../../../../node_modules/lodash/isArray.js"(exports, module) {
    var isArray = Array.isArray;
    module.exports = isArray;
  }
});

// ../../../../node_modules/lodash/isLength.js
var require_isLength = __commonJS({
  "../../../../node_modules/lodash/isLength.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    module.exports = isLength;
  }
});

// ../../../../node_modules/lodash/isArrayLike.js
var require_isArrayLike = __commonJS({
  "../../../../node_modules/lodash/isArrayLike.js"(exports, module) {
    var isFunction = require_isFunction();
    var isLength = require_isLength();
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    module.exports = isArrayLike;
  }
});

// ../../../../node_modules/lodash/isArrayLikeObject.js
var require_isArrayLikeObject = __commonJS({
  "../../../../node_modules/lodash/isArrayLikeObject.js"(exports, module) {
    var isArrayLike = require_isArrayLike();
    var isObjectLike = require_isObjectLike();
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    module.exports = isArrayLikeObject;
  }
});

// ../../../../node_modules/lodash/stubFalse.js
var require_stubFalse = __commonJS({
  "../../../../node_modules/lodash/stubFalse.js"(exports, module) {
    function stubFalse() {
      return false;
    }
    module.exports = stubFalse;
  }
});

// ../../../../node_modules/lodash/isBuffer.js
var require_isBuffer = __commonJS({
  "../../../../node_modules/lodash/isBuffer.js"(exports, module) {
    var root = require_root();
    var stubFalse = require_stubFalse();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var isBuffer = nativeIsBuffer || stubFalse;
    module.exports = isBuffer;
  }
});

// ../../../../node_modules/lodash/isPlainObject.js
var require_isPlainObject = __commonJS({
  "../../../../node_modules/lodash/isPlainObject.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var getPrototype = require_getPrototype();
    var isObjectLike = require_isObjectLike();
    var objectTag = "[object Object]";
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectCtorString = funcToString.call(Object);
    function isPlainObject(value) {
      if (!isObjectLike(value) || baseGetTag(value) != objectTag) {
        return false;
      }
      var proto = getPrototype(value);
      if (proto === null) {
        return true;
      }
      var Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
      return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
    }
    module.exports = isPlainObject;
  }
});

// ../../../../node_modules/lodash/_baseIsTypedArray.js
var require_baseIsTypedArray = __commonJS({
  "../../../../node_modules/lodash/_baseIsTypedArray.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isLength = require_isLength();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    module.exports = baseIsTypedArray;
  }
});

// ../../../../node_modules/lodash/_baseUnary.js
var require_baseUnary = __commonJS({
  "../../../../node_modules/lodash/_baseUnary.js"(exports, module) {
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    module.exports = baseUnary;
  }
});

// ../../../../node_modules/lodash/_nodeUtil.js
var require_nodeUtil = __commonJS({
  "../../../../node_modules/lodash/_nodeUtil.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        var types = freeModule && freeModule.require && freeModule.require("util").types;
        if (types) {
          return types;
        }
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    module.exports = nodeUtil;
  }
});

// ../../../../node_modules/lodash/isTypedArray.js
var require_isTypedArray = __commonJS({
  "../../../../node_modules/lodash/isTypedArray.js"(exports, module) {
    var baseIsTypedArray = require_baseIsTypedArray();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    module.exports = isTypedArray;
  }
});

// ../../../../node_modules/lodash/_safeGet.js
var require_safeGet = __commonJS({
  "../../../../node_modules/lodash/_safeGet.js"(exports, module) {
    function safeGet(object, key) {
      if (key === "constructor" && typeof object[key] === "function") {
        return;
      }
      if (key == "__proto__") {
        return;
      }
      return object[key];
    }
    module.exports = safeGet;
  }
});

// ../../../../node_modules/lodash/_assignValue.js
var require_assignValue = __commonJS({
  "../../../../node_modules/lodash/_assignValue.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var eq = require_eq();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function assignValue(object, key, value) {
      var objValue = object[key];
      if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === void 0 && !(key in object)) {
        baseAssignValue(object, key, value);
      }
    }
    module.exports = assignValue;
  }
});

// ../../../../node_modules/lodash/_copyObject.js
var require_copyObject = __commonJS({
  "../../../../node_modules/lodash/_copyObject.js"(exports, module) {
    var assignValue = require_assignValue();
    var baseAssignValue = require_baseAssignValue();
    function copyObject(source, props, object, customizer) {
      var isNew = !object;
      object || (object = {});
      var index = -1, length = props.length;
      while (++index < length) {
        var key = props[index];
        var newValue = customizer ? customizer(object[key], source[key], key, object, source) : void 0;
        if (newValue === void 0) {
          newValue = source[key];
        }
        if (isNew) {
          baseAssignValue(object, key, newValue);
        } else {
          assignValue(object, key, newValue);
        }
      }
      return object;
    }
    module.exports = copyObject;
  }
});

// ../../../../node_modules/lodash/_baseTimes.js
var require_baseTimes = __commonJS({
  "../../../../node_modules/lodash/_baseTimes.js"(exports, module) {
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    module.exports = baseTimes;
  }
});

// ../../../../node_modules/lodash/_isIndex.js
var require_isIndex = __commonJS({
  "../../../../node_modules/lodash/_isIndex.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    function isIndex(value, length) {
      var type = typeof value;
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    module.exports = isIndex;
  }
});

// ../../../../node_modules/lodash/_arrayLikeKeys.js
var require_arrayLikeKeys = __commonJS({
  "../../../../node_modules/lodash/_arrayLikeKeys.js"(exports, module) {
    var baseTimes = require_baseTimes();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isIndex = require_isIndex();
    var isTypedArray = require_isTypedArray();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = arrayLikeKeys;
  }
});

// ../../../../node_modules/lodash/_nativeKeysIn.js
var require_nativeKeysIn = __commonJS({
  "../../../../node_modules/lodash/_nativeKeysIn.js"(exports, module) {
    function nativeKeysIn(object) {
      var result = [];
      if (object != null) {
        for (var key in Object(object)) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = nativeKeysIn;
  }
});

// ../../../../node_modules/lodash/_baseKeysIn.js
var require_baseKeysIn = __commonJS({
  "../../../../node_modules/lodash/_baseKeysIn.js"(exports, module) {
    var isObject = require_isObject();
    var isPrototype = require_isPrototype();
    var nativeKeysIn = require_nativeKeysIn();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeysIn(object) {
      if (!isObject(object)) {
        return nativeKeysIn(object);
      }
      var isProto = isPrototype(object), result = [];
      for (var key in object) {
        if (!(key == "constructor" && (isProto || !hasOwnProperty.call(object, key)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = baseKeysIn;
  }
});

// ../../../../node_modules/lodash/keysIn.js
var require_keysIn = __commonJS({
  "../../../../node_modules/lodash/keysIn.js"(exports, module) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeysIn = require_baseKeysIn();
    var isArrayLike = require_isArrayLike();
    function keysIn(object) {
      return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
    }
    module.exports = keysIn;
  }
});

// ../../../../node_modules/lodash/toPlainObject.js
var require_toPlainObject = __commonJS({
  "../../../../node_modules/lodash/toPlainObject.js"(exports, module) {
    var copyObject = require_copyObject();
    var keysIn = require_keysIn();
    function toPlainObject(value) {
      return copyObject(value, keysIn(value));
    }
    module.exports = toPlainObject;
  }
});

// ../../../../node_modules/lodash/_baseMergeDeep.js
var require_baseMergeDeep = __commonJS({
  "../../../../node_modules/lodash/_baseMergeDeep.js"(exports, module) {
    var assignMergeValue = require_assignMergeValue();
    var cloneBuffer = require_cloneBuffer();
    var cloneTypedArray = require_cloneTypedArray();
    var copyArray = require_copyArray();
    var initCloneObject = require_initCloneObject();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isArrayLikeObject = require_isArrayLikeObject();
    var isBuffer = require_isBuffer();
    var isFunction = require_isFunction();
    var isObject = require_isObject();
    var isPlainObject = require_isPlainObject();
    var isTypedArray = require_isTypedArray();
    var safeGet = require_safeGet();
    var toPlainObject = require_toPlainObject();
    function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
      var objValue = safeGet(object, key), srcValue = safeGet(source, key), stacked = stack.get(srcValue);
      if (stacked) {
        assignMergeValue(object, key, stacked);
        return;
      }
      var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : void 0;
      var isCommon = newValue === void 0;
      if (isCommon) {
        var isArr = isArray(srcValue), isBuff = !isArr && isBuffer(srcValue), isTyped = !isArr && !isBuff && isTypedArray(srcValue);
        newValue = srcValue;
        if (isArr || isBuff || isTyped) {
          if (isArray(objValue)) {
            newValue = objValue;
          } else if (isArrayLikeObject(objValue)) {
            newValue = copyArray(objValue);
          } else if (isBuff) {
            isCommon = false;
            newValue = cloneBuffer(srcValue, true);
          } else if (isTyped) {
            isCommon = false;
            newValue = cloneTypedArray(srcValue, true);
          } else {
            newValue = [];
          }
        } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
          newValue = objValue;
          if (isArguments(objValue)) {
            newValue = toPlainObject(objValue);
          } else if (!isObject(objValue) || isFunction(objValue)) {
            newValue = initCloneObject(srcValue);
          }
        } else {
          isCommon = false;
        }
      }
      if (isCommon) {
        stack.set(srcValue, newValue);
        mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
        stack["delete"](srcValue);
      }
      assignMergeValue(object, key, newValue);
    }
    module.exports = baseMergeDeep;
  }
});

// ../../../../node_modules/lodash/_baseMerge.js
var require_baseMerge = __commonJS({
  "../../../../node_modules/lodash/_baseMerge.js"(exports, module) {
    var Stack = require_Stack();
    var assignMergeValue = require_assignMergeValue();
    var baseFor = require_baseFor();
    var baseMergeDeep = require_baseMergeDeep();
    var isObject = require_isObject();
    var keysIn = require_keysIn();
    var safeGet = require_safeGet();
    function baseMerge(object, source, srcIndex, customizer, stack) {
      if (object === source) {
        return;
      }
      baseFor(source, function(srcValue, key) {
        stack || (stack = new Stack());
        if (isObject(srcValue)) {
          baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
        } else {
          var newValue = customizer ? customizer(safeGet(object, key), srcValue, key + "", object, source, stack) : void 0;
          if (newValue === void 0) {
            newValue = srcValue;
          }
          assignMergeValue(object, key, newValue);
        }
      }, keysIn);
    }
    module.exports = baseMerge;
  }
});

// ../../../../node_modules/lodash/identity.js
var require_identity = __commonJS({
  "../../../../node_modules/lodash/identity.js"(exports, module) {
    function identity(value) {
      return value;
    }
    module.exports = identity;
  }
});

// ../../../../node_modules/lodash/_apply.js
var require_apply = __commonJS({
  "../../../../node_modules/lodash/_apply.js"(exports, module) {
    function apply(func, thisArg, args) {
      switch (args.length) {
        case 0:
          return func.call(thisArg);
        case 1:
          return func.call(thisArg, args[0]);
        case 2:
          return func.call(thisArg, args[0], args[1]);
        case 3:
          return func.call(thisArg, args[0], args[1], args[2]);
      }
      return func.apply(thisArg, args);
    }
    module.exports = apply;
  }
});

// ../../../../node_modules/lodash/_overRest.js
var require_overRest = __commonJS({
  "../../../../node_modules/lodash/_overRest.js"(exports, module) {
    var apply = require_apply();
    var nativeMax = Math.max;
    function overRest(func, start, transform) {
      start = nativeMax(start === void 0 ? func.length - 1 : start, 0);
      return function() {
        var args = arguments, index = -1, length = nativeMax(args.length - start, 0), array = Array(length);
        while (++index < length) {
          array[index] = args[start + index];
        }
        index = -1;
        var otherArgs = Array(start + 1);
        while (++index < start) {
          otherArgs[index] = args[index];
        }
        otherArgs[start] = transform(array);
        return apply(func, this, otherArgs);
      };
    }
    module.exports = overRest;
  }
});

// ../../../../node_modules/lodash/constant.js
var require_constant = __commonJS({
  "../../../../node_modules/lodash/constant.js"(exports, module) {
    function constant(value) {
      return function() {
        return value;
      };
    }
    module.exports = constant;
  }
});

// ../../../../node_modules/lodash/_baseSetToString.js
var require_baseSetToString = __commonJS({
  "../../../../node_modules/lodash/_baseSetToString.js"(exports, module) {
    var constant = require_constant();
    var defineProperty = require_defineProperty();
    var identity = require_identity();
    var baseSetToString = !defineProperty ? identity : function(func, string) {
      return defineProperty(func, "toString", {
        "configurable": true,
        "enumerable": false,
        "value": constant(string),
        "writable": true
      });
    };
    module.exports = baseSetToString;
  }
});

// ../../../../node_modules/lodash/_shortOut.js
var require_shortOut = __commonJS({
  "../../../../node_modules/lodash/_shortOut.js"(exports, module) {
    var HOT_COUNT = 800;
    var HOT_SPAN = 16;
    var nativeNow = Date.now;
    function shortOut(func) {
      var count = 0, lastCalled = 0;
      return function() {
        var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
        lastCalled = stamp;
        if (remaining > 0) {
          if (++count >= HOT_COUNT) {
            return arguments[0];
          }
        } else {
          count = 0;
        }
        return func.apply(void 0, arguments);
      };
    }
    module.exports = shortOut;
  }
});

// ../../../../node_modules/lodash/_setToString.js
var require_setToString = __commonJS({
  "../../../../node_modules/lodash/_setToString.js"(exports, module) {
    var baseSetToString = require_baseSetToString();
    var shortOut = require_shortOut();
    var setToString = shortOut(baseSetToString);
    module.exports = setToString;
  }
});

// ../../../../node_modules/lodash/_baseRest.js
var require_baseRest = __commonJS({
  "../../../../node_modules/lodash/_baseRest.js"(exports, module) {
    var identity = require_identity();
    var overRest = require_overRest();
    var setToString = require_setToString();
    function baseRest(func, start) {
      return setToString(overRest(func, start, identity), func + "");
    }
    module.exports = baseRest;
  }
});

// ../../../../node_modules/lodash/_isIterateeCall.js
var require_isIterateeCall = __commonJS({
  "../../../../node_modules/lodash/_isIterateeCall.js"(exports, module) {
    var eq = require_eq();
    var isArrayLike = require_isArrayLike();
    var isIndex = require_isIndex();
    var isObject = require_isObject();
    function isIterateeCall(value, index, object) {
      if (!isObject(object)) {
        return false;
      }
      var type = typeof index;
      if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
        return eq(object[index], value);
      }
      return false;
    }
    module.exports = isIterateeCall;
  }
});

// ../../../../node_modules/lodash/_createAssigner.js
var require_createAssigner = __commonJS({
  "../../../../node_modules/lodash/_createAssigner.js"(exports, module) {
    var baseRest = require_baseRest();
    var isIterateeCall = require_isIterateeCall();
    function createAssigner(assigner) {
      return baseRest(function(object, sources) {
        var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : void 0, guard = length > 2 ? sources[2] : void 0;
        customizer = assigner.length > 3 && typeof customizer == "function" ? (length--, customizer) : void 0;
        if (guard && isIterateeCall(sources[0], sources[1], guard)) {
          customizer = length < 3 ? void 0 : customizer;
          length = 1;
        }
        object = Object(object);
        while (++index < length) {
          var source = sources[index];
          if (source) {
            assigner(object, source, index, customizer);
          }
        }
        return object;
      });
    }
    module.exports = createAssigner;
  }
});

// ../../../../node_modules/lodash/merge.js
var require_merge = __commonJS({
  "../../../../node_modules/lodash/merge.js"(exports, module) {
    var baseMerge = require_baseMerge();
    var createAssigner = require_createAssigner();
    var merge2 = createAssigner(function(object, source, srcIndex) {
      baseMerge(object, source, srcIndex);
    });
    module.exports = merge2;
  }
});

// src/shared/gitignore.ts
var gitignore_exports = {};
__export(gitignore_exports, {
  SECURITY_GITIGNORE_ENTRIES: () => SECURITY_GITIGNORE_ENTRIES,
  ensureSecureGitignore: () => ensureSecureGitignore
});
import * as fs from "fs/promises";
import * as path2 from "path";
async function ensureSecureGitignore(cwd) {
  const gitignorePath = path2.join(cwd, ".gitignore");
  let content = "";
  try {
    await fs.access(gitignorePath);
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch {
  }
  const entriesToAdd = [];
  for (const [section, patterns] of Object.entries(
    SECURITY_GITIGNORE_ENTRIES
  )) {
    const missing = patterns.filter((pattern) => !content.includes(pattern));
    if (missing.length > 0) {
      entriesToAdd.push(`
# ${section}`);
      entriesToAdd.push(...missing);
    }
  }
  if (entriesToAdd.length > 0) {
    const newContent = content.trimEnd() + "\n" + entriesToAdd.join("\n") + "\n";
    await fs.writeFile(gitignorePath, newContent);
  }
}
var SECURITY_GITIGNORE_ENTRIES;
var init_gitignore = __esm({
  "src/shared/gitignore.ts"() {
    "use strict";
    SECURITY_GITIGNORE_ENTRIES = {
      "GoodVibes plugin state": [".goodvibes/"],
      "Environment files": [".env", ".env.local", ".env.*.local", "*.env"],
      "Secret files": [
        "*.pem",
        "*.key",
        "credentials.json",
        "secrets.json",
        "service-account*.json"
      ],
      "Cloud credentials": [".aws/", ".gcp/", "kubeconfig"],
      "Database files": ["*.db", "*.sqlite", "*.sqlite3", "prisma/*.db"],
      "Log files": ["*.log", "logs/"]
    };
  }
});

// src/post-tool-use/index.ts
var import_merge = __toESM(require_merge(), 1);
import * as fs7 from "fs/promises";
import * as path6 from "path";

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import * as fs2 from "fs/promises";
import * as path3 from "path";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
function resolvePluginRootFromDirname(dirname2) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  if (dirname2 !== void 0 && dirname2.includes("hooks")) {
    const hooksIndex = dirname2.indexOf("hooks");
    if (hooksIndex > 0) {
      return dirname2.substring(0, hooksIndex - 1);
    }
  }
  const devPluginPath = path.join(process.cwd(), "plugins", "goodvibes");
  return devPluginPath;
}
function resolvePluginRoot() {
  const currentDirname = typeof __dirname !== "undefined" ? __dirname : void 0;
  return resolvePluginRootFromDirname(currentDirname);
}
var PLUGIN_ROOT = resolvePluginRoot();
var PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var CACHE_DIR = path.join(PLUGIN_ROOT, ".cache");
var ANALYTICS_FILE = path.join(CACHE_DIR, "analytics.json");

// src/shared/logging.ts
function debug(message, data) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (data !== void 0) {
    console.error(
      `[GoodVibes ${timestamp}] ${message}:`,
      JSON.stringify(data, null, 2)
    );
  } else {
    console.error(`[GoodVibes ${timestamp}] ${message}`);
  }
}
function logError(context, error) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : void 0;
  console.error(`[GoodVibes ${timestamp}] ERROR in ${context}: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

// src/shared/file-utils.ts
var exec = promisify(execCallback);
async function fileExists(filePath) {
  try {
    await fs2.access(filePath);
    return true;
  } catch (error) {
    debug(`File access check failed for ${filePath}: ${error}`);
    return false;
  }
}
async function ensureGoodVibesDir(cwd) {
  const goodvibesDir = path3.join(cwd, ".goodvibes");
  if (!await fileExists(goodvibesDir)) {
    await fs2.mkdir(goodvibesDir, { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "memory"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "state"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "logs"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "telemetry"), { recursive: true });
    const { ensureSecureGitignore: ensureSecureGitignore2 } = await Promise.resolve().then(() => (init_gitignore(), gitignore_exports));
    await ensureSecureGitignore2(cwd);
  }
  const configFile = path3.join(goodvibesDir, "goodvibes.json");
  if (!await fileExists(configFile)) {
    await fs2.writeFile(configFile, "{}\n", "utf-8");
  }
  return goodvibesDir;
}
function isExecError(error) {
  return error !== null && typeof error === "object";
}
function extractErrorOutput(error) {
  if (isExecError(error)) {
    return error.stdout?.toString() || error.stderr?.toString() || error.message || "Unknown error";
  }
  return String(error);
}

// src/shared/hook-io.ts
import process2 from "process";
function isTestEnvironment() {
  return process2.env.NODE_ENV === "test" || process2.env.VITEST === "true" || typeof globalThis.__vitest_worker__ !== "undefined";
}
function isValidHookInput(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return typeof obj.session_id === "string" && typeof obj.cwd === "string" && typeof obj.hook_event_name === "string";
}
async function readHookInput() {
  const chunks = [];
  for await (const chunk of process2.stdin) {
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!isValidHookInput(parsed)) {
    throw new Error("Invalid hook input structure");
  }
  return parsed;
}
function formatResponse(response) {
  return JSON.stringify(response);
}
function respond(response, _block = false) {
  console.log(formatResponse(response));
  process2.exit(0);
}

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "1000",
  10
);
var CHECKPOINT_TRIGGERS = {
  fileCountThreshold: 5,
  afterAgentComplete: true,
  afterMajorChange: true
};

// src/shared/index.ts
init_gitignore();

// src/shared/analytics.ts
import * as fs3 from "fs/promises";
async function ensureCacheDir() {
  if (!await fileExists(CACHE_DIR)) {
    await fs3.mkdir(CACHE_DIR, { recursive: true });
  }
}
async function loadAnalytics() {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs3.readFile(ANALYTICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (typeof parsed === "object" && parsed !== null && "session_id" in parsed) {
        return parsed;
      }
      return null;
    } catch (error) {
      debug("loadAnalytics failed", { error: String(error) });
      return null;
    }
  }
  return null;
}
async function saveAnalytics(analytics) {
  await ensureCacheDir();
  await fs3.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}
async function getSessionId() {
  const analytics = await loadAnalytics();
  if (analytics?.session_id) {
    return analytics.session_id;
  }
  return `session_${Date.now()}`;
}
async function logToolUsage(usage) {
  const existingAnalytics = await loadAnalytics();
  const analytics = existingAnalytics ?? {
    session_id: await getSessionId(),
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    tool_usage: [],
    skills_recommended: [],
    validations_run: 0,
    issues_found: 0
  };
  analytics.tool_usage.push(usage);
  await saveAnalytics(analytics);
}

// src/shared/keywords-data.json
var keywords_data_default = {
  stackKeywords: {
    frameworks_frontend: [
      "react",
      "nextjs",
      "next.js",
      "vue",
      "nuxt",
      "svelte",
      "sveltekit",
      "angular",
      "solid",
      "solidjs",
      "qwik",
      "astro",
      "remix",
      "gatsby"
    ],
    frameworks_backend: ["express", "fastify", "hono", "koa", "nest", "nestjs"],
    languages: ["typescript", "javascript", "python", "rust", "go", "golang"],
    databases: [
      "postgresql",
      "postgres",
      "mysql",
      "sqlite",
      "mongodb",
      "redis",
      "supabase",
      "firebase",
      "turso"
    ],
    orms: ["prisma", "drizzle", "typeorm", "sequelize", "knex", "kysely"],
    api: ["rest", "graphql", "trpc", "grpc", "websocket", "socket.io"],
    auth: ["clerk", "nextauth", "auth.js", "lucia", "auth0", "jwt", "oauth"],
    ui: [
      "tailwind",
      "tailwindcss",
      "shadcn",
      "radix",
      "chakra",
      "mantine",
      "mui"
    ],
    state: ["zustand", "redux", "jotai", "recoil", "mobx", "valtio"],
    testing: ["vitest", "jest", "playwright", "cypress", "testing-library"],
    build: ["vite", "webpack", "esbuild", "rollup", "turbopack", "bun"],
    devops: [
      "docker",
      "kubernetes",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "railway"
    ],
    ai: ["openai", "anthropic", "claude", "gpt", "llm", "langchain", "vercel-ai"]
  },
  transcriptKeywords: {
    frameworks: [
      "react",
      "next",
      "nextjs",
      "vue",
      "angular",
      "svelte",
      "remix",
      "astro",
      "express",
      "fastify",
      "hono",
      "koa",
      "nest",
      "nestjs",
      "django",
      "flask",
      "fastapi",
      "rails",
      "laravel",
      "spring",
      "springboot"
    ],
    databases: [
      "postgres",
      "postgresql",
      "mysql",
      "mariadb",
      "sqlite",
      "mongodb",
      "mongo",
      "redis",
      "dynamodb",
      "supabase",
      "planetscale",
      "turso",
      "neon",
      "prisma",
      "drizzle",
      "kysely",
      "typeorm",
      "sequelize"
    ],
    auth: [
      "auth",
      "authentication",
      "authorization",
      "oauth",
      "jwt",
      "session",
      "clerk",
      "auth0",
      "nextauth",
      "lucia",
      "passport",
      "login",
      "signup",
      "password",
      "token"
    ],
    testing: [
      "test",
      "testing",
      "jest",
      "vitest",
      "mocha",
      "chai",
      "playwright",
      "cypress",
      "puppeteer",
      "unit test",
      "integration test",
      "e2e",
      "coverage"
    ],
    api: [
      "api",
      "rest",
      "graphql",
      "trpc",
      "grpc",
      "endpoint",
      "route",
      "handler",
      "middleware",
      "openapi",
      "swagger",
      "apollo"
    ],
    devops: [
      "docker",
      "kubernetes",
      "k8s",
      "terraform",
      "ansible",
      "ci",
      "cd",
      "pipeline",
      "deploy",
      "deployment",
      "aws",
      "gcp",
      "azure",
      "vercel",
      "netlify",
      "railway",
      "github actions",
      "gitlab ci"
    ],
    frontend: [
      "css",
      "tailwind",
      "styled-components",
      "sass",
      "scss",
      "component",
      "ui",
      "ux",
      "responsive",
      "animation",
      "form",
      "modal",
      "table",
      "button",
      "input"
    ],
    state: [
      "state",
      "redux",
      "zustand",
      "jotai",
      "recoil",
      "mobx",
      "context",
      "provider",
      "store"
    ],
    typescript: [
      "typescript",
      "type",
      "interface",
      "generic",
      "enum",
      "zod",
      "yup",
      "io-ts",
      "validation",
      "schema"
    ],
    performance: [
      "performance",
      "optimization",
      "cache",
      "caching",
      "lazy",
      "bundle",
      "minify",
      "compress",
      "speed"
    ],
    security: [
      "security",
      "xss",
      "csrf",
      "sql injection",
      "sanitize",
      "encrypt",
      "hash",
      "ssl",
      "https",
      "cors"
    ],
    files: [
      "file",
      "upload",
      "download",
      "stream",
      "buffer",
      "read",
      "write",
      "create",
      "delete",
      "modify"
    ]
  }
};

// src/shared/keywords.ts
var STACK_KEYWORD_CATEGORIES = keywords_data_default.stackKeywords;
var TRANSCRIPT_KEYWORD_CATEGORIES = keywords_data_default.transcriptKeywords;
var ALL_STACK_KEYWORDS = Object.values(
  STACK_KEYWORD_CATEGORIES
).flat();
var ALL_TRANSCRIPT_KEYWORDS = Object.values(
  TRANSCRIPT_KEYWORD_CATEGORIES
).flat();
var ALL_KEYWORDS = [
  .../* @__PURE__ */ new Set([...ALL_STACK_KEYWORDS, ...ALL_TRANSCRIPT_KEYWORDS])
];
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var STACK_KEYWORD_REGEX_MAP = new Map(
  ALL_STACK_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
  ])
);
var TRANSCRIPT_KEYWORD_REGEX_MAP = new Map(
  ALL_TRANSCRIPT_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
  ])
);

// src/shared/runtime-client.ts
import * as net from "node:net";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join as join4 } from "node:path";
import { tmpdir } from "node:os";
var HOOK_EVENT_TIMEOUT_MS = 500;
var QUERY_TIMEOUT_MS = 500;
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
var RuntimeClient = class {
  /** Absolute path to the Unix domain socket, or null if not discoverable. */
  socketPath;
  /**
   * @param sessionId - Optional Claude Code session ID for session-keyed
   *   socket pointer lookup. When provided, enables exact-match discovery
   *   via `runtime-{sessionId}.socket` pointer files.
   */
  constructor(sessionId) {
    this.socketPath = this.discoverSocket(sessionId);
  }
  // ─── Public API ─────────────────────────────────────────────────────────────
  /**
   * Returns true if the runtime engine socket path was discovered and the
   * socket file currently exists on disk.
   *
   * This is a fast synchronous check — it does NOT attempt a connection.
   */
  isAvailable() {
    return this.socketPath !== null && existsSync(this.socketPath);
  }
  /**
   * Notify the runtime engine of a hook event.
   *
   * Fire-and-forget semantics with a 500 ms timeout. Returns the response
   * data if the engine replies in time, or null otherwise. Errors are
   * swallowed — the hook must never fail because of this call.
   *
   * @param hookName  - Logical hook event name (e.g. 'session:started').
   * @param hookInput - Full hook input payload received from Claude Code.
   * @returns Response data from the engine, or null on timeout/error.
   */
  async sendHookEvent(hookName, hookInput) {
    if (!this.isAvailable()) return null;
    const message = {
      type: "hook_event",
      id: generateId(),
      hook_name: hookName,
      hook_input: hookInput,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const response = await this.sendMessage(message, HOOK_EVENT_TIMEOUT_MS);
    if (!response || response.status === "error") return null;
    return response.data ?? null;
  }
  /**
   * Query the runtime engine for state or a decision.
   *
   * Times out after QUERY_TIMEOUT_MS milliseconds (default 500 ms). Returns null if the engine is unreachable or
   * the call fails for any reason. Errors are swallowed.
   *
   * @param query - The query to execute (discriminated by `kind`).
   * @returns Response data from the engine, or null on timeout/error.
   */
  async query(query) {
    if (!this.isAvailable()) return null;
    const message = {
      type: "query",
      id: generateId(),
      query
    };
    const response = await this.sendMessage(message, QUERY_TIMEOUT_MS);
    if (!response || response.status === "error") return null;
    return response.data ?? null;
  }
  // ─── Private helpers ────────────────────────────────────────────────────────
  /**
   * Open a new Unix domain socket connection, write the JSON message
   * (newline-terminated), read the JSON response (newline-terminated),
   * then close. Returns null on timeout or any socket error.
   *
   * @param message   - The IPC message to send.
   * @param timeoutMs - Maximum milliseconds to wait before giving up.
   * @returns Parsed {@link IPCResponse}, or null on failure.
   */
  sendMessage(message, timeoutMs) {
    const socketPath = this.socketPath;
    return new Promise((resolve2) => {
      let resolved = false;
      const done = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve2(result);
      };
      const timer = setTimeout(() => {
        socket.destroy();
        done(null);
      }, timeoutMs);
      const socket = net.createConnection({ path: socketPath });
      socket.once("error", () => {
        done(null);
      });
      socket.once("connect", () => {
        const payload = JSON.stringify(message) + "\n";
        socket.write(payload, "utf-8");
      });
      let rawData = "";
      socket.on("data", (chunk) => {
        rawData += chunk.toString("utf-8");
        const newlineIdx = rawData.indexOf("\n");
        if (newlineIdx === -1) return;
        const line = rawData.slice(0, newlineIdx);
        socket.destroy();
        try {
          const response = JSON.parse(line);
          done(response);
        } catch {
          done(null);
        }
      });
      socket.once("close", () => {
        done(null);
      });
    });
  }
  /**
   * Discover the runtime engine socket path using five strategies.
   *
   * Resolution order:
   * 1. `GOODVIBES_RUNTIME_SOCKET` env var — set by runtime engine at startup.
   * 2. Session-keyed pointer file `runtime-{sessionId}.socket` — exact match, no ambiguity.
   * 3. Pointer file scan `runtime-{id}.socket` (PID or UUID) — fallback for concurrent sessions.
   * 4. Legacy pointer file `runtime.socket` — backward compatibility with older engine versions.
   * 5. Well-known tmpdir path: `{os.tmpdir()}/goodvibes-runtime/runtime.sock`.
   *
   * @param sessionId - Optional Claude Code session ID for session-keyed lookup (Strategy 2).
   * @returns Absolute socket path string, or null if none is discoverable.
   */
  discoverSocket(sessionId) {
    const envPath = process.env["GOODVIBES_RUNTIME_SOCKET"];
    if (envPath) {
      return envPath;
    }
    const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
    const stateDir = join4(cwd, ".goodvibes", "state");
    const stateDirExists = existsSync(stateDir);
    if (sessionId && stateDirExists) {
      try {
        const sessionPointer = join4(stateDir, `runtime-${sessionId}.socket`);
        const socketPath = readFileSync(sessionPointer, "utf-8").trim();
        if (socketPath && existsSync(socketPath)) return socketPath;
      } catch {
      }
    }
    if (stateDirExists) {
      try {
        const entries = readdirSync(stateDir);
        for (const entry of entries) {
          if (/^runtime-[a-zA-Z0-9_-]+\.socket$/.test(entry)) {
            try {
              const socketPath = readFileSync(join4(stateDir, entry), "utf-8").trim();
              if (socketPath && existsSync(socketPath)) return socketPath;
            } catch {
            }
          }
        }
      } catch {
      }
    }
    const legacyPointerFile = join4(stateDir, "runtime.socket");
    if (existsSync(legacyPointerFile)) {
      try {
        const socketPath = readFileSync(legacyPointerFile, "utf-8").trim();
        if (socketPath && existsSync(socketPath)) return socketPath;
      } catch {
      }
    }
    const defaultPath = join4(tmpdir(), "goodvibes-runtime", "runtime.sock");
    if (existsSync(defaultPath)) {
      return defaultPath;
    }
    return null;
  }
};

// src/state/persistence.ts
import * as fs4 from "fs/promises";
import * as path4 from "path";

// src/types/state.ts
function createDefaultState() {
  return {
    session: {
      id: "",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      mode: "default",
      featureDescription: null
    },
    errors: {},
    tests: {
      lastFullRun: null,
      lastQuickRun: null,
      passingFiles: [],
      failingFiles: [],
      pendingFixes: []
    },
    build: {
      lastRun: null,
      status: "unknown",
      errors: [],
      fixAttempts: 0
    },
    git: {
      mainBranch: "main",
      currentBranch: "main",
      featureBranch: null,
      featureStartedAt: null,
      featureDescription: null,
      checkpoints: [],
      pendingMerge: false
    },
    files: {
      modifiedSinceCheckpoint: [],
      modifiedThisSession: [],
      createdThisSession: []
    },
    devServers: {}
  };
}

// src/state/persistence.ts
var STATE_FILE = "state/hooks-state.json";
async function loadState(cwd, options = {}) {
  const { throwOnError = false } = options;
  const goodvibesDir = path4.join(cwd, ".goodvibes");
  const statePath = path4.join(goodvibesDir, STATE_FILE);
  if (!await fileExists(statePath)) {
    return createDefaultState();
  }
  try {
    const content = await fs4.readFile(statePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && "session" in parsed) {
      return parsed;
    }
    return createDefaultState();
  } catch (error) {
    debug("Failed to load state, using defaults", error);
    if (throwOnError) {
      throw error;
    }
    return createDefaultState();
  }
}
async function saveState(cwd, state, options = {}) {
  const { throwOnError = false } = options;
  await ensureGoodVibesDir(cwd);
  const statePath = path4.join(cwd, ".goodvibes", STATE_FILE);
  const stateDir = path4.dirname(statePath);
  if (!await fileExists(stateDir)) {
    await fs4.mkdir(stateDir, { recursive: true });
  }
  try {
    const tempPath = statePath + ".tmp";
    await fs4.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs4.rename(tempPath, statePath);
  } catch (error) {
    debug("Failed to save state", error);
    if (throwOnError) {
      throw error;
    }
  }
}

// src/state/updaters.ts
function updateNestedState(state, key, updates) {
  return {
    ...state,
    [key]: { ...state[key], ...updates }
  };
}
function updateTestState(state, updates) {
  return updateNestedState(state, "tests", updates);
}
function updateBuildState(state, updates) {
  return updateNestedState(state, "build", updates);
}

// src/types/config.ts
function getDefaultConfig() {
  return {
    automation: {
      enabled: true,
      mode: "default",
      testing: {
        runAfterFileChange: true,
        runBeforeCommit: true,
        runBeforeMerge: true,
        testCommand: "npm test",
        maxRetries: 3
      },
      building: {
        runAfterFileThreshold: 5,
        runBeforeCommit: true,
        runBeforeMerge: true,
        buildCommand: "npm run build",
        typecheckCommand: "npx tsc --noEmit",
        maxRetries: 3
      },
      git: {
        autoFeatureBranch: true,
        autoCheckpoint: true,
        autoMerge: true,
        checkpointThreshold: 5,
        mainBranch: "main"
      },
      recovery: {
        maxRetriesPerError: 3,
        logFailures: true,
        skipAfterMaxRetries: true
      }
    }
  };
}

// src/post-tool-use/dev-server-monitor.ts
var DEV_SERVER_PATTERNS = [
  /npm run dev/,
  /npm start/,
  /yarn dev/,
  /pnpm dev/,
  /next dev/,
  /vite/,
  /node.*server/
];
function isDevServerCommand(command) {
  return DEV_SERVER_PATTERNS.some((pattern) => pattern.test(command));
}
function registerDevServer(state, pid, command, port) {
  state.devServers[pid] = {
    command,
    port,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastError: null
  };
}
function recordDevServerError(state, pid, error) {
  if (state.devServers[pid]) {
    state.devServers[pid].lastError = error;
  }
}
var ERROR_PATTERNS = [
  /Error: (.+)/,
  /Unhandled Runtime Error: (.+)/,
  /TypeError: (.+)/,
  /ReferenceError: (.+)/,
  /SyntaxError: (.+)/,
  /Module not found: (.+)/
];
function parseDevServerErrors(output) {
  const errors = [];
  for (const pattern of ERROR_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, "g"));
    for (const match of matches) {
      if (match[1]) {
        errors.push(match[1]);
      }
    }
  }
  return errors;
}

// src/post-tool-use/bash-handler.ts
function handleBashTool(state, input) {
  const toolInput = input.tool_input;
  const command = toolInput?.command;
  const output = toolInput?.output;
  if (!command) {
    return { isDevServer: false, errors: [] };
  }
  if (isDevServerCommand(command)) {
    const pid = `bash_${Date.now()}`;
    registerDevServer(state, pid, command, 3e3);
    debug(`Registered dev server: ${command}`);
    return { isDevServer: true, errors: [] };
  }
  if (output) {
    const errors = parseDevServerErrors(output);
    if (errors.length > 0) {
      for (const pid of Object.keys(state.devServers)) {
        recordDevServerError(state, pid, errors.join("; "));
      }
      return { isDevServer: false, errors };
    }
  }
  return { isDevServer: false, errors: [] };
}

// src/automation/build-runner.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
var execAsync = promisify2(exec2);
var TYPECHECK_COMMAND = "npx tsc --noEmit";
async function runTypeCheck(cwd) {
  try {
    await execAsync(TYPECHECK_COMMAND, { cwd, timeout: 12e4 });
    return { passed: true, summary: "Type check passed", errors: [] };
  } catch (error) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: "Type errors found",
      errors: parseBuildErrors(output)
    };
  }
}
function parseBuildErrors(output) {
  const errors = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/(.+)\((\d+),\d+\):\s*error\s*TS\d+:\s*(.+)/);
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        message: match[3]
      });
    }
  }
  return errors;
}

// src/automation/test-runner.ts
import { exec as exec3 } from "child_process";
import * as fs5 from "fs";
import { promisify as promisify3 } from "util";
var execAsync2 = promisify3(exec3);
var FAILURE_CONTEXT_LINES = 5;
function findTestsForFile(sourceFile) {
  const testPatterns = [
    sourceFile.replace(/\.tsx?$/, ".test.ts"),
    sourceFile.replace(/\.tsx?$/, ".test.tsx"),
    sourceFile.replace(/\.tsx?$/, ".spec.ts"),
    sourceFile.replace(/\.tsx?$/, ".spec.tsx"),
    sourceFile.replace(/src\/(.*)\.tsx?$/, "src/__tests__/$1.test.ts"),
    sourceFile.replace(/src\/(.*)\.tsx?$/, "tests/$1.test.ts")
  ];
  return testPatterns.filter((pattern) => fs5.existsSync(pattern));
}
async function runTests(testFiles, cwd) {
  if (testFiles.length === 0) {
    return { passed: true, summary: "No tests to run", failures: [] };
  }
  try {
    const fileArgs = testFiles.join(" ");
    await execAsync2(`npm test -- ${fileArgs}`, {
      cwd,
      timeout: 3e5
    });
    return {
      passed: true,
      summary: `${testFiles.length} test files passed`,
      failures: []
    };
  } catch (error) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: "Tests failed",
      failures: parseTestFailures(output)
    };
  }
}
function parseTestFailures(output) {
  const failures = [];
  const lines = output.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const failMatch = line.match(/FAIL\s+(.+\.test\.[tj]sx?)/);
    if (failMatch) {
      failures.push({
        testFile: failMatch[1],
        testName: "unknown",
        error: lines.slice(i, i + FAILURE_CONTEXT_LINES).join("\n")
      });
    }
  }
  return failures;
}

// src/automation/git-operations.ts
import { exec as exec4 } from "child_process";
import { promisify as promisify4 } from "util";

// src/automation/spawn-utils.ts
import { spawn } from "child_process";
function spawnAsync(command, args, options) {
  return new Promise((resolve2) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    const timeoutId = options.timeout ? setTimeout(() => {
      child.kill("SIGTERM");
      resolve2({
        code: null,
        stdout,
        stderr: stderr + "\nProcess timed out"
      });
    }, options.timeout) : (
      /* v8 ignore next -- @preserve defensive: all exported functions always provide timeout */
      null
    );
    child.on("close", (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve2({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve2({ code: null, stdout, stderr: err.message });
    });
  });
}
function sanitizeForGit(input) {
  return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, "");
}

// src/automation/git-operations.ts
var execAsync3 = promisify4(exec4);
async function execGit(command, cwd) {
  try {
    const { stdout } = await execAsync3(command, {
      cwd,
      encoding: "utf-8",
      timeout: 3e4
    });
    return stdout.trim();
  } catch (error) {
    debug("execGit failed", { command, error: String(error) });
    return null;
  }
}
async function hasUncommittedChanges(cwd) {
  const status = await execGit("git status --porcelain", cwd);
  return status !== null && status.length > 0;
}
async function createCheckpoint(cwd, message) {
  if (!await hasUncommittedChanges(cwd)) {
    return false;
  }
  try {
    const safeMessage = sanitizeForGit(message);
    const commitMessage = `checkpoint: ${safeMessage}

 Auto-checkpoint by GoodVibes`;
    await execAsync3("git add -A", { cwd, timeout: 3e4 });
    const result = await spawnAsync("git", ["commit", "-m", commitMessage], {
      cwd,
      timeout: 3e4
    });
    return result.code === 0;
  } catch (error) {
    debug("createCheckpoint failed", { error: String(error) });
    return false;
  }
}
async function createFeatureBranch(cwd, name) {
  try {
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const branchName = `feature/${safeName}`;
    const result = await spawnAsync("git", ["checkout", "-b", branchName], {
      cwd,
      timeout: 3e4
    });
    return result.code === 0;
  } catch (error) {
    debug("createFeatureBranch failed", { error: String(error) });
    return false;
  }
}

// src/post-tool-use/file-tracker.ts
function trackFileModification(state, filePath) {
  const modifiedSession = new Set(state.files.modifiedThisSession);
  const modifiedCheckpoint = new Set(state.files.modifiedSinceCheckpoint);
  modifiedSession.add(filePath);
  modifiedCheckpoint.add(filePath);
  return {
    ...state,
    files: {
      ...state.files,
      modifiedThisSession: Array.from(modifiedSession),
      modifiedSinceCheckpoint: Array.from(modifiedCheckpoint)
    }
  };
}
function trackFileCreation(state, filePath) {
  const created = new Set(state.files.createdThisSession);
  created.add(filePath);
  const stateWithCreated = {
    ...state,
    files: {
      ...state.files,
      createdThisSession: Array.from(created)
    }
  };
  return trackFileModification(stateWithCreated, filePath);
}
function clearCheckpointTracking(state) {
  return {
    ...state,
    files: {
      ...state.files,
      modifiedSinceCheckpoint: []
    }
  };
}
function getModifiedFileCount(state) {
  return state.files.modifiedSinceCheckpoint.length;
}

// src/post-tool-use/checkpoint-manager.ts
function shouldCheckpoint(state, _cwd) {
  const fileCount = getModifiedFileCount(state);
  if (fileCount >= CHECKPOINT_TRIGGERS.fileCountThreshold) {
    return { triggered: true, reason: `${fileCount} files modified` };
  }
  return { triggered: false, reason: "" };
}
async function createCheckpointIfNeeded(state, cwd, forcedReason) {
  const trigger = forcedReason ? { triggered: true, reason: forcedReason } : shouldCheckpoint(state, cwd);
  if (!trigger.triggered) {
    return { created: false, message: "", state };
  }
  if (!await hasUncommittedChanges(cwd)) {
    return { created: false, message: "No changes to checkpoint", state };
  }
  const success = await createCheckpoint(cwd, trigger.reason);
  if (success) {
    const updatedState = clearCheckpointTracking(state);
    const finalState = {
      ...updatedState,
      git: {
        ...updatedState.git,
        checkpoints: [
          {
            hash: "",
            // Would need to get from git
            message: trigger.reason,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          },
          ...updatedState.git.checkpoints
        ]
      }
    };
    return {
      created: true,
      message: `Checkpoint: ${trigger.reason}`,
      state: finalState
    };
  }
  return { created: false, message: "Checkpoint failed", state };
}

// src/post-tool-use/git-branch-manager.ts
var BRANCH_NAME_MAX_LENGTH = 50;
function shouldCreateFeatureBranch(state, _cwd) {
  if (state.git.featureBranch) {
    return false;
  }
  if (state.git.currentBranch !== state.git.mainBranch) {
    return false;
  }
  return state.files.createdThisSession.length === 1;
}
async function maybeCreateFeatureBranch(state, cwd, featureName) {
  if (!shouldCreateFeatureBranch(state, cwd)) {
    return { created: false, branchName: null };
  }
  const name = featureName ?? state.session.featureDescription ?? "feature";
  const branchName = `feature/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, BRANCH_NAME_MAX_LENGTH)}`;
  const success = await createFeatureBranch(cwd, name);
  if (success) {
    state.git.featureBranch = branchName;
    state.git.currentBranch = branchName;
    state.git.featureStartedAt = (/* @__PURE__ */ new Date()).toISOString();
    state.git.featureDescription = name;
    return { created: true, branchName };
  }
  return { created: false, branchName: null };
}

// src/post-tool-use/automation-runners.ts
async function maybeRunTests(state, config, filePath, cwd) {
  if (!config.automation.enabled || !config.automation.testing.runAfterFileChange) {
    return { ran: false, result: null, state };
  }
  if (filePath.includes(".test.") || filePath.includes(".spec.")) {
    return { ran: false, result: null, state };
  }
  const testFiles = findTestsForFile(filePath);
  if (testFiles.length === 0) {
    debug(`No tests found for: ${filePath}`);
    return { ran: false, result: null, state };
  }
  debug(`Running tests for: ${filePath}`, { testFiles });
  try {
    const result = await runTests(testFiles, cwd);
    if (result.passed) {
      state = updateTestState(state, {
        lastQuickRun: (/* @__PURE__ */ new Date()).toISOString(),
        passingFiles: [.../* @__PURE__ */ new Set([...state.tests.passingFiles, ...testFiles])],
        failingFiles: state.tests.failingFiles.filter(
          (f) => !testFiles.includes(f)
        )
      });
    } else {
      state = updateTestState(state, {
        lastQuickRun: (/* @__PURE__ */ new Date()).toISOString(),
        failingFiles: [.../* @__PURE__ */ new Set([...state.tests.failingFiles, ...testFiles])],
        passingFiles: state.tests.passingFiles.filter(
          (file) => !testFiles.includes(file)
        ),
        pendingFixes: result.failures.map((failure) => ({
          testFile: failure.testFile,
          error: failure.error,
          fixAttempts: 0
        }))
      });
    }
    return { ran: true, result, state };
  } catch (error) {
    logError("maybeRunTests", error);
    return { ran: false, result: null, state };
  }
}
async function maybeRunBuild(state, config, cwd) {
  if (!config.automation.enabled) {
    return { ran: false, result: null, state };
  }
  const modifiedCount = getModifiedFileCount(state);
  const threshold = config.automation.building.runAfterFileThreshold;
  if (modifiedCount < threshold) {
    debug(
      `Build skipped: ${modifiedCount} files modified (threshold: ${threshold})`
    );
    return { ran: false, result: null, state };
  }
  debug(`Running typecheck after ${modifiedCount} file modifications`);
  try {
    const result = await runTypeCheck(cwd);
    state = updateBuildState(state, {
      lastRun: (/* @__PURE__ */ new Date()).toISOString(),
      status: result.passed ? "passing" : "failing",
      errors: result.errors,
      fixAttempts: result.passed ? 0 : state.build.fixAttempts + 1
    });
    return { ran: true, result, state };
  } catch (error) {
    logError("maybeRunBuild", error);
    return { ran: false, result: null, state };
  }
}
async function maybeCreateCheckpoint(state, config, cwd) {
  if (!config.automation.enabled || !config.automation.git.autoCheckpoint) {
    return { created: false, message: "", state };
  }
  return await createCheckpointIfNeeded(state, cwd);
}
async function maybeCreateBranch(state, config, cwd) {
  if (!config.automation.enabled || !config.automation.git.autoFeatureBranch) {
    return { created: false, branchName: null };
  }
  return await maybeCreateFeatureBranch(state, cwd);
}

// src/post-tool-use/file-automation.ts
function handleFileModification(state, input, toolName) {
  const toolInput = input.tool_input;
  const filePath = toolInput?.file_path;
  if (!filePath) {
    return { tracked: false, filePath: null, state };
  }
  let newState;
  if (toolName === "Write") {
    newState = trackFileCreation(state, filePath);
    debug(`Tracked file creation: ${filePath}`);
  } else {
    newState = trackFileModification(state, filePath);
    debug(`Tracked file modification: ${filePath}`);
  }
  return { tracked: true, filePath, state: newState };
}
async function processFileAutomation(state, config, input, toolName) {
  const messages = [];
  const cwd = input.cwd;
  const trackResult = handleFileModification(state, input, toolName);
  if (!trackResult.tracked || !trackResult.filePath) {
    return { messages, state };
  }
  state = trackResult.state;
  const testResult = await maybeRunTests(
    state,
    config,
    trackResult.filePath,
    cwd
  );
  state = testResult.state;
  if (testResult.ran && testResult.result) {
    if (!testResult.result.passed) {
      messages.push(`Tests failed: ${testResult.result.summary}`);
    }
  }
  const buildResult = await maybeRunBuild(state, config, cwd);
  state = buildResult.state;
  if (buildResult.ran && buildResult.result) {
    if (!buildResult.result.passed) {
      messages.push(`Build check: ${buildResult.result.summary}`);
    }
  }
  const checkpoint = await maybeCreateCheckpoint(state, config, cwd);
  state = checkpoint.state;
  if (checkpoint.created) {
    messages.push(checkpoint.message);
  }
  const branch = await maybeCreateBranch(state, config, cwd);
  if (branch.created && branch.branchName) {
    messages.push(`Created feature branch: ${branch.branchName}`);
  }
  return { messages, state };
}

// src/post-tool-use/mcp-handlers.ts
import * as fs6 from "fs/promises";
import * as path5 from "path";

// src/post-tool-use/response.ts
function createResponse2(systemMessage) {
  return {
    continue: true,
    systemMessage
  };
}
function combineMessages(messages) {
  return messages.length > 0 ? messages.join(" | ") : void 0;
}

// src/post-tool-use/mcp-handlers.ts
async function handleDetectStack(input) {
  try {
    debug("handleDetectStack called", { has_tool_input: !!input.tool_input });
    await ensureCacheDir();
    const cacheFile = path5.join(CACHE_DIR, "detected-stack.json");
    if (input.tool_input) {
      await fs6.writeFile(cacheFile, JSON.stringify(input.tool_input, null, 2));
      debug(`Cached stack detection to ${cacheFile}`);
    }
    await logToolUsage({
      tool: "detect_stack",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    respond(
      createResponse2(
        "Stack detected. Consider using recommend_skills for relevant skill suggestions."
      )
    );
  } catch (error) {
    logError("handleDetectStack", error);
    respond(
      createResponse2(
        `Error caching stack: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
async function handleRecommendSkills(input) {
  try {
    const analytics = await loadAnalytics();
    if (analytics && input.tool_input) {
      const toolInput = input.tool_input;
      if (toolInput.recommendations && Array.isArray(toolInput.recommendations)) {
        const skillPaths = toolInput.recommendations.filter(
          (r) => typeof r === "object" && r !== null && "path" in r && typeof r.path === "string"
        ).map((rec) => rec.path);
        analytics.skills_recommended.push(...skillPaths);
        await saveAnalytics(analytics);
      }
    }
    await logToolUsage({
      tool: "recommend_skills",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}
async function handleSearch(_input) {
  await logToolUsage({
    tool: "search",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    success: true
  });
  respond(createResponse2());
}
async function handleValidateImplementation(input) {
  try {
    const analytics = await loadAnalytics();
    if (analytics) {
      analytics.validations_run += 1;
      const toolInput = input.tool_input;
      if (toolInput?.summary) {
        const summary = toolInput.summary;
        analytics.issues_found += (summary.errors || 0) + (summary.warnings || 0);
      }
      await saveAnalytics(analytics);
    }
    await logToolUsage({
      tool: "validate_implementation",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}
async function handleRunSmokeTest(input) {
  try {
    await logToolUsage({
      tool: "run_smoke_test",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    const toolInput = input.tool_input;
    if (toolInput?.passed === false) {
      const summary = toolInput.summary;
      const failed = summary?.failed ?? 0;
      respond(
        createResponse2(
          `Smoke test: ${failed} check(s) failed. Review output for details.`
        )
      );
      return;
    }
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}
async function handleCheckTypes(input) {
  try {
    const analytics = await loadAnalytics();
    await logToolUsage({
      tool: "check_types",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    const toolInput = input.tool_input;
    if (toolInput?.errors && Array.isArray(toolInput.errors) && analytics) {
      analytics.issues_found += toolInput.errors.length;
      await saveAnalytics(analytics);
      respond(
        createResponse2(
          `TypeScript: ${toolInput.errors.length} type error(s) found.`
        )
      );
      return;
    }
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}

// src/post-tool-use/index.ts
async function loadAutomationConfig(cwd) {
  const configPath = path6.join(cwd, ".goodvibes", "automation.json");
  const defaults = getDefaultConfig();
  if (!await fileExists(configPath)) {
    return defaults;
  }
  try {
    const content = await fs7.readFile(configPath, "utf-8");
    const userConfig = JSON.parse(content);
    if (typeof userConfig === "object" && userConfig !== null) {
      return (0, import_merge.default)({}, defaults, userConfig);
    }
    return defaults;
  } catch (error) {
    debug("loadAutomationConfig failed", { error: String(error) });
    return defaults;
  }
}
async function runPostToolUseHook() {
  try {
    const input = await readHookInput();
    debug("PostToolUse hook received input", { tool_name: input.tool_name });
    try {
      const runtimeClient = new RuntimeClient(input.session_id);
      if (runtimeClient.isAvailable()) {
        debug("Phase 6: runtime engine available, sending hook:post_tool_use event");
        await runtimeClient.sendHookEvent("hook:post_tool_use", input);
        const queryResult = await runtimeClient.query({ kind: "get_system_message" });
        if (queryResult?.kind === "system_message") {
          debug("Phase 6: runtime returned system message, using it");
          respond(createResponse2(queryResult.message));
          return;
        }
      }
    } catch {
      debug("Phase 6: runtime integration error, falling through to existing logic");
    }
    const cwd = input.cwd;
    let state = await loadState(cwd);
    const config = await loadAutomationConfig(cwd);
    const fullToolName = input.tool_name ?? "";
    const toolName = fullToolName.includes("__") ? fullToolName.split("__").pop() ?? "" : fullToolName;
    debug(`Processing tool: ${toolName} (full: ${fullToolName})`);
    let automationMessages = [];
    switch (toolName) {
      case "Edit":
      case "Write": {
        const result = await processFileAutomation(
          state,
          config,
          input,
          toolName
        );
        state = result.state;
        automationMessages = result.messages;
        break;
      }
      case "Bash": {
        const bashResult = handleBashTool(state, input);
        const MAX_ERRORS_TO_DISPLAY = 3;
        if (bashResult.errors.length > 0) {
          automationMessages.push(
            `Dev server errors detected: ${bashResult.errors.slice(0, MAX_ERRORS_TO_DISPLAY).join(", ")}`
          );
        }
        break;
      }
      // MCP GoodVibes tools
      case "detect_stack":
        await saveState(cwd, state);
        void handleDetectStack(input);
        return;
      case "recommend_skills":
        await saveState(cwd, state);
        void handleRecommendSkills(input);
        return;
      case "search_skills":
      case "search_agents":
      case "search_tools":
        await saveState(cwd, state);
        void handleSearch(input);
        return;
      case "validate_implementation":
        await saveState(cwd, state);
        void handleValidateImplementation(input);
        return;
      case "run_smoke_test":
        await saveState(cwd, state);
        void handleRunSmokeTest(input);
        return;
      case "check_types":
        await saveState(cwd, state);
        void handleCheckTypes(input);
        return;
      default:
        debug(`Tool '${toolName}' - no special handling`);
    }
    await saveState(cwd, state);
    const systemMessage = combineMessages(automationMessages);
    respond(createResponse2(systemMessage));
  } catch (error) {
    logError("PostToolUse main", error);
    respond(
      createResponse2(
        `Hook error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
if (!isTestEnvironment()) {
  runPostToolUseHook().catch((error) => {
    logError("PostToolUse uncaught", error);
    respond(createResponse2(`Uncaught error: ${String(error)}`));
  });
}
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
/* v8 ignore else -- @preserve defensive check: match[1] is always truthy with (.+) patterns */
/* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
