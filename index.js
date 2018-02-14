const parseComment = require('comment-parser');
const path = require('path');

let babel, imports, levelsUp, modulePath, recast, resourcePath;

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

function processComments(comments) {
  for (let i = 0, ii = comments.length; i < ii; ++i) {
    let comment = comments[i];
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
  }
}

module.exports = function(b) {

  babel = b;

  return {
    visitor: {
      Program: function(path, state) {
        recast = state.file.opts.parserOpts && state.file.opts.parserOpts.parser == 'recast';
        const commentsProperty = recast ? 'comments' : 'leadingComments';
        resourcePath = state.file.opts.filename;
        imports = {};
        if (path.parent[commentsProperty]) {
          processComments(path.parent[commentsProperty]);
        }
        path.traverse({
          enter(path) {
            if (path.node[commentsProperty]) {
              processComments(path.node[commentsProperty]);
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
