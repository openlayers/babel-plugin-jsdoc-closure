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

function processTags(tags, comment) {
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
          const moduleMatch = type.match(/module:([^\.]*)\.(.*)$/);
          if (moduleMatch && moduleMatch[1] == modulePath) {
            replacement = moduleMatch[2];
          } else {
            replacement = formatType(type);
            const importLine = formatImport(type);
            imports[importLine] = true;
          }
          comment = comment.replace(new RegExp(type, 'g'), replacement);
        });
      }
    }
  });
  return comment;
}

module.exports = function(babel) {

  return {
    visitor: {
      Program: function(path, state) {
        const recast = state.file.opts.parserOpts && state.file.opts.parserOpts.parser == 'recast';
        resourcePath = state.file.opts.filename;
        imports = {};
        path.traverse({
          enter(path) {
            const comments = recast ? path.node.comments : path.node.leadingComments;
            if (comments) {
              comments.forEach((comment, i) => {
                if (comment.type == 'CommentBlock') {
                  let tags, modified;
                  do {
                    const parsedComment = parseComment(`/*${comment.value}*/`);
                    if (parsedComment && parsedComment.length > 0) {
                      tags = parsedComment[0].tags;
                      const newValue = processTags(tags, comment.value);
                      modified = newValue !== comment.value;
                      if (modified) {
                        if (recast) {
                          comments[i] = babel.transform(`/*${newValue}*/`).ast.comments[0];
                          comment = comments[i];
                        } else {
                          comment.value = newValue;
                        }
                      }
                    }
                  } while (modified);
                }
              });
            }
          }
        });
        Object.keys(imports).forEach(i => {
          const node = babel.transform(i).ast.program.body[0];
          path.pushContainer('body', node);
        });
      }
    }
  };

};
