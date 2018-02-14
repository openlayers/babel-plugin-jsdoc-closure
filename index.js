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
          const moduleMatch = type.match(/module:([^\.]*)\.(.*)$/);
          if (moduleMatch && moduleMatch[1] == modulePath) {
            replacement = moduleMatch[2];
          } else {
            replacement = formatType(type);
            const importLine = formatImport(type);
            imports[importLine] = true;
          }
          newComment = comment.value.replace(new RegExp(type, 'g'), replacement);
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
      type[tag.name] = tag.type;
    }
  }
  if (typedef) {
    const closureTypedef = type ? JSON.stringify(type).replace(/"/g, '') : typedef.type;
    const numLines = comment.value.split('\n').length;
    newComment = typedef.source.replace(/(@typedef\s*){[^}]+}.*/, `$1{${closureTypedef}}`);
    newComment = `* ${newComment} `;
    for (let i = 0, ii = numLines.length; i < ii; ++i) {
      newComment += '\n *';
    }
    if (typedef.name) {
      typedefExport = `export let ${typedef.name};`;
    }
  }
  return [newComment, typedefExport];
}

function processComments(comments) {
  for (let i = 0, ii = comments.length; i < ii; ++i) {
    let comment = comments[i];
    if (comment.type == 'CommentBlock') {
      let tags, newComment, typedefExport;
      do {
        const parsedComment = parseComment(`/*${comment.value}*/`);
        if (parsedComment && parsedComment.length > 0) {
          tags = parsedComment[0].tags;
          newComment = processTags(tags, comment);
          if (!newComment && !typedefExport) {
            [newComment, typedefExport] = processTypedef(tags, comment);
          }
          if (newComment) {
            if (recast) {
              comments[i] = babel.transform(`/*${newComment}*/`).ast.comments[0];
              comment = comments[i];
            } else {
              comment.value = newComment;
            }
          }
          if (typedefExport) {
            //eslint-disable-line
          }
        }
      } while (newComment);
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
        if (path.parent.comments) {
          processComments(path.parent.comments);
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
