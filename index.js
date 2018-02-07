const parseComment = require('comment-parser');
const path = require('path');

let imports, levelsUp, modulePath, resourcePath;

function parseModules(type) {
  return type.match(/module\:[^ \|\}\>,=\n]+/g);
}

function formatImport(type) {
  type = type.replace(/^module\:/, '');
  const pathParts = type.split('/');
  const name = pathParts.pop();
  const namedParts = name.split('.');
  let up = '';
  for (let i = 1; i < levelsUp; ++i) {
    up += '../';
  }
  const typePath = (up || './') + (pathParts.length > 0 ? pathParts.join('/') + '/' : '');

  if (namedParts.length > 1) {
    return `const ${formatType(type)} = require('${typePath}${namedParts[0]}').${namedParts[1]};`;
  } else {
    return `const ${formatType(type)} = require('${typePath}${namedParts[0]}');`;
  }
}

function formatType(type) {
  type = type.replace(/module\:/, '');
  const pathParts = type.split('/');
  const name = pathParts.pop();
  const namedParts = name.split('.');
  if (namedParts.length > 1) {
    return `${pathParts.join('_')}_${namedParts.join('_')}`;
  } else {
    return `${pathParts.join('$')}$${namedParts[0]}`;
  }
}

function processTags(comment, lines) {
  let modified = false;
  comment.tags.forEach(tag => {
    if (tag.tag == 'module') {
      modulePath = tag.name;
      levelsUp = modulePath.split('/').length;
      if (path.basename(resourcePath) == 'index.js') {
        ++levelsUp;
      }
    } else {
      if (tag.type && tag.type.indexOf('module:') !== -1) {
        parseModules(tag.type).forEach(type => {
          modified = true;
          let replacement;
          const moduleMatch = type.match(/module:([^\.]*)\.(.*)$/);
          if (moduleMatch && moduleMatch[1] == modulePath) {
            replacement = moduleMatch[2];
          } else {
            replacement = formatType(type);
            const importLine = formatImport(type);
            imports[importLine] = true;
          }
          for (let i = tag.line, ii = lines.length; i < ii; ++i) {
            lines[i] = lines[i].replace(type, replacement);
          }
        });
      }
    }
  });
  return modified;
}

module.exports = function(babel) {

  return {
    visitor: {
      Program: {
        enter(path, state) {
          resourcePath = state.file.opts.filename;
          imports = {};
          path.traverse({
            enter(path) {
              if (path.node.leadingComments) {
                path.node.leadingComments.forEach(comment => {
                  if (comment.type == 'CommentBlock') {
                    let commentSource = `/*${comment.value}*/`;
                    const lines = commentSource.split('\n');
                    let tags, modified;
                    do {
                      tags = parseComment(commentSource)[0];
                      modified = processTags(tags, lines);
                      if (modified) {
                        commentSource = lines.join('\n');
                        comment.value = commentSource.substring(2, commentSource.length - 2);
                      }
                    } while (modified);
                  }
                });
              }
            }
          });
        },
        exit(path, state) {
          Object.keys(imports).forEach(i => {
            const node = babel.transform(i).ast;
            path.pushContainer('body', node);
          });
        }
      }
    }
  };

};
