const parseComment = require('comment-parser');
const path = require('path');
const fs = require('fs');

let babel, commentsProperty, imports, levelsUp, modulePath, recast, resourcePath;

function parseModules(type) {
  return type.match(/module\:[^ \|\}\>\),=\n]+/g).map(match => {
    // Strip incomplete type applications (e.g. `.<T`) from comment-parser.
    //TODO Fix this with a custom parser instead.
    return match.replace(/\.?\<.*$/, '');
  });
}

function formatImport(type) {
  type = type.replace(/^module\:/, '');
  const pathParts = type.split('/');
  const name = pathParts.pop();
  const namedParts = name.split(/[\.~]/);
  let up = '';
  for (let i = 1; i < levelsUp; ++i) {
    up += '../';
  }
  const typePath = (up || './') + (pathParts.length > 0 ? pathParts.join('/') + '/' : '');
  const filePath = `${typePath}${namedParts[0]}`;

  if (namedParts.length > 1) {
    const dependency = require.resolve(path.resolve(path.dirname(resourcePath), filePath));
    const content = babel.transform(fs.readFileSync(dependency, 'utf-8'));
    let defaultExportName;
    const candidates = content.ast.program.body;
    for (let i = 0, ii = candidates.length; i < ii; ++i) {
      const node = candidates[i];
      if (node.type == 'ExportDefaultDeclaration') {
        defaultExportName = node.declaration.name;
        break;
      }
    }
    if (namedParts[1] != defaultExportName) {
      return `${filePath}.${namedParts[1]}`;
    }
  }
  return `${filePath}`;
}

function processTags(tags, comment) {
  let newComment;
  tags.forEach(tag => {
    if (tag.tag == 'module') {
      modulePath = tag.name;
      levelsUp = modulePath.split('/').length;
      if (path.basename(resourcePath) == 'index.js') {
        ++levelsUp;
      }
    } else {
      if (tag.type && tag.type.indexOf('module:') !== -1) {
        parseModules(tag.type).forEach(type => {
          let replacement;
          const moduleMatch = type.match(/module:([^\.]*)[\.~](.*)$/);
          if (moduleMatch && moduleMatch[1] == modulePath) {
            replacement = moduleMatch[2];
          } else {
            replacement = formatImport(type);
          }
          const lookup = path.resolve(path.dirname(resourcePath), replacement);
          if (lookup in imports) {
            replacement = imports[lookup];
          }
          newComment = comment.value.replace(new RegExp(`${type}([^~])`, 'g'), `${replacement}$1`);
        });
      }
    }
  });
  return newComment;
}

function processTypedef(tags, comment) {
  let type, typedef, typedefExport, newComment;
  for (let i = 0, ii = tags.length; i < ii; ++i) {
    const tag = tags[i];
    if (tag.tag == 'typedef') {
      typedef = tag;
    } else if (tag.tag == 'property') {
      if (!type) {
        type = {};
      }
      type[tag.name] = `(${tag.optional ? 'undefined|' : ''}${tag.type})`;
    }
  }
  if (typedef) {
    const closureTypedef = type ? JSON.stringify(type).replace(/"/g, '') : typedef.type;
    let addLines = comment.value.split('\n').length - 1;
    newComment = typedef.source.replace(/(@typedef\s*){[^}]+}\s.*/, `$1{${closureTypedef}}`);
    newComment = `* ${newComment}`;
    if (typedef.name) {
      addLines--;
      typedefExport = `export let ${typedef.name};\n`;
    }
    while (addLines--) {
      newComment += '\n' + (addLines >= 1 ? ' *' : '');
    }
    newComment += ' ';
  }
  return [newComment, typedefExport];
}

function processComments(property, node, path) {
  const comments = node[property];
  for (let i = 0, ii = comments.length; i < ii; ++i) {
    let comment = comments[i];
    if (comment.type == 'CommentBlock') {
      let tags, modified, typedefExport;
      do {
        const parsedComment = parseComment(`/*${comment.value}*/`);
        if (parsedComment && parsedComment.length > 0) {
          tags = parsedComment[0].tags;
          const oldComment = comment.value;
          let newComment = processTags(tags, comment);
          modified = newComment && oldComment != newComment;
          if (!newComment && !typedefExport) {
            [newComment, typedefExport] = processTypedef(tags, comment);
          }
          if (newComment) {
            if (recast) {
              comment = babel.transform(`/*${newComment}*/`).ast.comments[0];
              comments[i] = comment;
            } else {
              comment.value = newComment;
            }
          }
          if (typedefExport) {
            const program = babel.transform(typedefExport).ast.program;
            const newNode = program.body[0];
            newNode[commentsProperty] = comments.splice(0, i + 1);
            newNode[commentsProperty].forEach(comment => {
              comment.leading = true;
            });
            i = -1;
            ii = comments.length;
            if (node.type != 'Program') {
              path.insertBefore(newNode);
            } else {
              path.parent.program.body.push(newNode);
            }
            typedefExport = undefined;
            newComment = undefined;
          }
        }
      } while (modified);
    }
  }
}

module.exports = function(b) {

  babel = b;
  const t = babel.types;

  return {
    visitor: {
      ReturnStatement(path) {
        const argument = path.node.argument;
        if (argument && argument.comments && argument.extra && argument.extra.parenthesized) {
          const parenthesized = t.parenthesizedExpression(path.node.argument);
          const comments = path.node.argument.comments;
          delete path.node.argument.comments;
          parenthesized.comments = comments;
          path.node.argument = parenthesized;
        }
      },
      Program(p, state) {
        imports = {};
        recast = state.file.opts.parserOpts && state.file.opts.parserOpts.parser == 'recast';
        commentsProperty = recast ? 'comments' : 'leadingComments';
        resourcePath = state.file.opts.filename;
        const root = p.node;
        const innerCommentsProperty = recast ? 'comments' : 'innerComments';
        if (root[innerCommentsProperty]) {
          processComments(innerCommentsProperty, root, p);
        }
        p.traverse({
          enter(p) {
            if (p.node.type == 'ImportDeclaration') {
              const specifiers = p.node.specifiers;
              for (let i = 0, ii = specifiers.length; i < ii; ++i) {
                const specifier = specifiers[i];
                let modulePath = path.resolve(path.dirname(resourcePath), p.node.source.value);
                modulePath = modulePath.replace(/\.js$/, '');
                if (specifier.type == 'ImportDefaultSpecifier') {
                  imports[modulePath] = specifier.local.name;
                } else if (specifier.type == 'ImportSpecifier') {
                  imports[`${modulePath}.${specifier.imported.name}`] = specifier.local.name;
                }
              }
            }
            if (p.node[commentsProperty]) {
              processComments(commentsProperty, p.node, p);
            }
          }
        });
      }
    }
  };

};
