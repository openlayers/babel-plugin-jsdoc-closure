# babel-plugin-jsdoc-closure

Transpiles JSDoc types from [namepaths](http://usejsdoc.org/about-namepaths.html) with [module identifiers](http://usejsdoc.org/howto-commonjs-modules.html#module-identifiers) to types for Closure Compiler.

This is useful for type checking and building an application or library from a set of ES modules with Closure Compiler, without the use of any additional bundler.

## Installation

    npm install babel-cli babel-plugin-jsdoc-Closure

### Configuration

Create a `.babelrc` file in the root of your project to enable the plugin:

```json
{
  "plugins": ["jsdoc-closure"],
}
```

**Note**: When your code uses Closure type casts (i.e. something like `/** @type {Custom} */ (foo)`), you need to configure Babel to use recast as parser and generator by modifying your `.babelrc` file:

```json
{
  "plugins": ["jsdoc-closure"],
  "parserOpts": {
    "parser": "recast"
  },
  "generatorOpts": {
    "generator": "recast"
  }
}
```

You will also need to install recast to make this work:

    npm install recast

To run the transform on your sources (`src/`) and output them to `build/`, run

    node_modules/.bin/babel --out-dir build src

To build your project, create a simple build script (e.g. `build.js`) like this:

```js
const Compiler = require('google-closure-compiler').compiler;

const compiler = new Compiler({
  js: [
    'build/**.js',
    // add directories for your dependencies, if any, here
  ],
  entry_point: 'build/index.js',
  module_resolution: 'NODE',
  dependency_mode: 'STRICT',
  process_common_js_modules: true,
  jscomp_error: ['newCheckTypes'],
  // Uncomment and modify for dependencies without Closure annotations
  //hide_warnings_for: ['node_modules']
  js_output_file: 'bundle.js'
});

compiler.run((exit, out, err) => {
  if (exit) {
    process.stderr.write(err, () => process.exit(exit));
  } else {
    process.stderr.write(out);
    process.stderr.write(err);
  }
});
```

To run the Compiler, simply call

    node build.js
