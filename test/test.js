const babel = require('babel-core');
const assert = require('assert');
const path = require('path');

const options = {
  plugins: path.resolve(__dirname, '../index.js')
};

const recastOptions = {
  plugins: path.resolve(__dirname, '../index.js'),
  parserOpts: {
    parser: 'recast'
  },
  generatorOpts: {
    generator: 'recast',
    quote: 'single'
  }
};

describe('babel-plugin-jsdoc-closure', function() {

  function test(source, expected, filename) {
    let got = babel.transform(source,  filename ? Object.assign({filename}, recastOptions) : recastOptions);
    assert.equal(got.code, expected.replace(/\(\) \{\};/g, '() {}'));
    got = babel.transform(source, filename ? Object.assign({filename}, options) : options);
    assert.equal(got.code.replace(/[\n\s]+/g, ''), expected.replace(/[\n\s]+/g, ''));
  }

  it('transforms a type with an imported module', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @type {module:module1/Bar} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @type {../module1/Bar} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('transforms a type cast with an imported module in a return statement', function() {
    // requires recast
    const source =
      '/** @module module2/types */\n' +
      'function getFoo() {\n' +
      '  return /** @type {module:module1/Bar} */ (bar.getBar());\n' +
      '}';
    const expected =
      '/** @module module2/types */\n' +
      'function getFoo() {\n' +
      '  return (\n    /** @type {../module1/Bar} */\n    (bar.getBar())\n  );\n' +
      '}';
    const filename = './test/module2/types.js';
    const got = babel.transform(source, Object.assign({filename}, recastOptions));
    assert.equal(got.code, expected);
  });

  it('transforms an object property type cast with an imported module in a return statement', function() {
    // requires recast
    const source =
      '/** @module module2/types */\n' +
      'function getFoo() {\n' +
      '  return /** @type {Object} */ ({\n      foo: /** @type {module:module1/Foo} */ (\'bar\')\n  });\n' +
      '}';
    const expected =
      '/** @module module2/types */\n' +
      'function getFoo() {\n' +
      '  return (\n    /** @type {Object} */ ({\n      foo: /** @type {../module1/Foo} */ (\'bar\')\n    })\n  );\n' +
      '}';
    const filename = './test/module2/types.js';
    const got = babel.transform(source, Object.assign({filename}, recastOptions));
    assert.equal(got.code, expected);
  });

  it('transforms a type with an imported default export', function() {
    test(
      '/** @module module2/types */\n' +
      'import Bar from \'../module1/Bar\';\n' +
      '/** @type {module:module1/Bar~BarDefault} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      'import Bar from \'../module1/Bar\';\n' +
      '/** @type {Bar} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('transforms a type with an imported named export', function() {
    test(
      '/** @module module2/types */\n' +
      'import {foo as Foo} from \'../types\';\n' +
      '/** @type {module:types.foo} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      'import {foo as Foo} from \'../types\';\n' +
      '/** @type {Foo} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('transforms an enum imported as default export', function() {
    test(
      '/** @module module2/types */\n' +
      'import Bar from \'../module1/Bar\';\n' +
      '/** @type {module:module1/Type} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      'import Bar from \'../module1/Bar\';\n' +
      '/** @type {../module1/Type} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });


  it('transforms a type with a JSDoc module path', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @type {module:types~foo} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @type {../types.foo} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('transforms a type with type application of module paths', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @type {module:types~foo.<module:types~bar>} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @type {../types.foo.<../types.bar>} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('resolves path correctly for index.js files', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @type {module:module1/Bar} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @type {../../module1/Bar} */\n' +
      'let foo;',
      './test/module2/types/index.js'
    );
  });

  it('replaces module type in a compound type', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @type {module:module1/Bar|string} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @type {../module1/Bar|string} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('replaces module type in a nested type', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @type {Object<string, module:module1/Bar>} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @type {Object<string, ../module1/Bar>} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('replaces module type in an optional param', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @param {module:module1/Bar=} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @param {../module1/Bar=} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('replaces module type in an non nullable param', function() {
    test(
      '/** @module module2/types */\n' +
      '/** @param {!module:module1/Bar} */\n' +
      'let foo;',
      '/** @module module2/types */\n' +
      '/** @param {!../module1/Bar} */\n' +
      'let foo;',
      './test/module2/types.js'
    );
  });

  it('exports typedefs', function() {
    test(
      '/** @module module2/types */\n' +
      '/**\n' +
      ' * @typedef {number} Foo\n' +
      ' */\n',
      '/** @module module2/types */\n' +
      '/** @typedef {number} */\n' +
      'export let Foo;\n',
      './test/module2/types.js'
    );
  });

  it('turns Object typedefs into structural interfaces', function() {
    test(
      '/** @module module2/types */\n' +
      '/**\n' +
      ' * @typedef {Object}\n' +
      ' * Foo\n' +
      ' * @property {!module:module1/Bar} bar Bar.\n' +
      ' * @property {number} [baz=0] Baz.\n' +
      ' */\n',
      '/** @module module2/types */\n' +
      '/** @interface */\n' +
      'export function Foo() {};\n\n' +
      '/** @type {(!../module1/Bar)} */\n' +
      'Foo.prototype.bar;\n\n' +
      '/** @type {(undefined|number)} */\n' +
      'Foo.prototype.baz;\n',
      './test/module2/types.js'
    );
  });

});
