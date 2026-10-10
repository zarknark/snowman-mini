export default class Parser {

  tokenLine = 0;
  tokenChar = 0;
  workingText = ''

  INLINE_WS=/[ \t]/;
  NEWLINE_WS=/[\r\n]/;
  SHORTHAND_CHARS = /[A-Za-z-_.# ]/

  /// AST GENERATOR
  toAst(tokens) {

    let currentPos = 0;

    function walk(depth = 1) {

      if (currentPos >= tokens.length) {
        if (depth !== 0 ) {
          throw 'ERROR: end of token stream reached and depth is not 0!';
        }
        return null;
      }
      let token = tokens[currentPos];

      switch (token.type) {
        case 'underscore-interp-start':
        case 'underscore-interp-esc-start':
        case 'underscore-start': {
          let utType = "UnderscoreTemplate";
          if (token.type === 'underscore-interp-start') {
            utType = "UnderscoreInterpolate";
          } else if (token.type === "underscore-interp-esc-start") {
            utType = "UnderscoreInterpolateEscaped";
          }

          token = tokens[++currentPos];

          let node = {
            type: utType,
            children: []
          }

          while (token.type !== 'underscore-end') {
            node.children.push(walk());
            token = tokens[currentPos];
          }

          currentPos += 1;

          return node;
        }
        case 'tw-link-start': {
          token = tokens[++currentPos];

          let node = {
            type: 'TwineLink',
            label: [],
            passage: [],
            isEmbed: false
          }

          let separator=''
          let leftChildren = []
          let rightChildren = []

          while (token.type !== 'tw-link-end') {
            if (separator === '') {
              if (['pipe', 'arrow', 'rev-arrow'].includes(token.type)) {
                separator = token.type;
                token = tokens[++currentPos];
              } else {
                leftChildren.push(walk());
                token = tokens[currentPos];
              }
            } else {
              rightChildren.push(walk());
              token = tokens[currentPos];
            }
          }

          if (rightChildren.length === 0) {
            node.passage = leftChildren;
          } else {
            node.isEmbed = separator === 'rev-arrow';
            if (node.isEmbed) {
              node.label = rightChildren;
              node.passage = leftChildren;
            } else {
              node.label = leftChildren;
              node.passage = rightChildren;
            }
          }

          currentPos += 1;

          return node;
        }
        case 'fl-variable': {
          token = tokens[++currentPos];

          if (token.type !== 'word') {
            throw "ERROR: '<|' should always be immediately followed by a variable name"
          }

          currentPos += 1;

          return {
            type: 'FrostliningInterpolate',
            var_name: token.value
          }
        }
        case 'fl-conditional-start': {

          let node = {
            type: 'FrostliningConditional',
            conditional: token.value,
            ifChildren: [],
            elseChildren: []
          }

          token = tokens[++currentPos];

          let pipeCharFound = false;
          while (token.type !== 'fl-conditional-end') {
            if (!pipeCharFound) {
              if (token.type !== 'pipe') {
                node.ifChildren.push(walk());
                token = tokens[currentPos];
              } else {
                pipeCharFound = true;
                token = tokens[++currentPos];
              }
            } else {
              node.elseChildren.push(walk());
              token = tokens[currentPos];
            }
          }

          currentPos += 1;

          return node;
        }
        case 'fl-html-start': {

          let node = {
            type: 'FrostliningHtmlShorthand',
            tag: '',
            id: '',
            classes: [],
            children: []
          }

          // break down token into tag, id, and classes
          const htmlString = token.value;
          const tokenSplit = htmlString.split(/[.#]/)


          tokenSplit.forEach((element, index) => {
            if (index === 0) {
              // if this is completely empty, the tag defaults to 'p'
              if (element.length === 0) {
                node.tag = 'p';
              } else {
                node.tag = element;
              }
              return;
            }

            if (element.trim().length === 0) {
              throw `Error: HTML-shorthand ${htmlString} cannot have an empty class or id`
            }
            if (index === 0) {
              node.tag = element;
            } else {
              if (token.value.includes(`.${element}`)) {
                node.classes.push(element);
              }
              if (token.value.includes(`#${element}`)) {
                if (node.id !== '') {
                  throw `Error: HTML-shorthand ${htmlString} cannot have more than one defined id`;
                }
                node.id = element;
              }
            }
          });

          token = tokens[++currentPos];

          // if the next token is a word, add it by itself to the children
          // and return.
          if (token.type === 'word') {
            node.children.push({
              type: 'Source',
              value: token.value
            });

            currentPos += 1;

            return node;
          }

          // Otherwise, look for the ending tag.
          while (token.type !== 'fl-html-end') {
            node.children.push(walk());
            token = tokens[currentPos];
          }

          currentPos += 1;
          return node;
        }
        case 'fl-footnote-start': {
          token = tokens[++currentPos];

          let node = {
            type: 'FrostliningFootnote',
            label: [],
            children: []
          };

          let pipeCharFound = false;
          while (token.type !== 'fl-footnote-end') {
            if (!pipeCharFound) {
              if (token.type !== 'pipe') {
                node.label.push(walk());
                token = tokens[currentPos];
              } else {
                pipeCharFound = true;
                token = tokens[++currentPos];
              }
            } else {
              node.children.push(walk());
            }
            token = tokens[currentPos];
          }

          currentPos += 1;
          return node;
        }
        case 'source':
        case 'word': {
          let node = {
            type: 'Source',
            value: token.value,
          }

          if (++currentPos < tokens.length) {
            token = tokens[currentPos];

            while (token.type === 'word' || token.type === 'source') {
              node.value += ` ${token.value}`;
              token = tokens[++currentPos];
            }
          }

          return node;
        }
        case 'newline': {
          currentPos += 1;

          return {
            type: 'Newline',
            value: '\n'
          }
        }
        case 'sq-bracket-open': {
          currentPos += 1;

          let node = {
            type: 'BracketedText',
            children: []
          }

          while (token.type !== 'sq-bracket-closed') {
            node.children.push(walk());
            token = tokens[currentPos];
          }

          currentPos += 1;

          return node;
        }
        case 'pipe': {
          currentPos += 1;

          return {
            type: 'Source',
            value: '|'
          }
        }
        default:
          throw `Error: Unexpected token '${token.type}' at line ${token.pos[0]}, column ${token.pos[1]}.`
      }
    }

    let ast = {
      type: 'Passage',
      body: [],
    };

    while (currentPos < tokens.length) {
      let node = walk(0);
      if (node != null) {
        ast.body.push(node);
      }
    }

    return ast;
  }

  /// TOKENIZER & HELPERS

  tokenize(input) {
    if (typeof input != "string") {
      console.log("Parse error: non-string input")
      throw "ERROR: non-string input (Parser.tokenize)"
    }

    let currentPos = 0;
    let tokens = [];


    while (currentPos < input.length) {
      let char = input[currentPos];

      // newline handling
      if (this.NEWLINE_WS.test(char)) {
        this.pushToken(tokens, {type: 'newline', value: '\n', pos: [this.tokenLine, this.tokenChar]});

        currentPos += 1;
        this.tokenLine += 1;
        this.tokenChar = 0;
        continue;
      }

      /*
       * Possible opening template tag
       */
      if (char === '<') {
        if (currentPos + 1 < input.length) {
          let nextPos = currentPos + 1;
          let nextChar = input[nextPos];

          // Check for frostlining dialogue start: '<<<'
          if (nextChar === '<' && this.nextCharMatches('<', nextPos, input)) {
            this.pushToken(tokens, {type: 'fl-dialogue-start', value: '<<<', pos: [this.tokenLine, this.tokenChar]});
            currentPos += 3;
            this.tokenChar += 3;
            continue;
          }
          // Check for frostlining var-substitution opening tag: '<|[var_name]'
          else if (nextChar === '|') {
            this.pushToken(tokens, {type: 'fl-variable', value: '<|', pos: [this.tokenLine, this.tokenChar]});
            currentPos += 2;
            this.tokenChar += 2;

            // Variable names should have no whitespace between themselves and the tag.
            let newPos = this.pushConnectedSourceUntil(/\s/, input, currentPos, tokens)
            this.tokenChar += newPos - currentPos;
            currentPos = newPos;
            continue;
          }
          // Check for frostlining conditional statement: '<? [JS_expr] ? [text] (| [text] ?>)'
          else if (nextChar === '?') {
            let conditionalEndPos = this.pushSourceUntil(/\?/, input, currentPos + 2, tokens, 'fl-conditional-start')
            if (conditionalEndPos !== currentPos) {
              this.tokenChar += conditionalEndPos + 1 - currentPos;
              currentPos = conditionalEndPos + 1;
              continue;
            }
          }
          // Check for HTML shorthand markup: '<:[fl-styling-names]: [text] (:>)'
          else if (nextChar === ':') {
            let shorthandEndPos = this.pushSourceUntil(/:/, input, currentPos + 2, tokens, 'fl-html-start', true);
            if (shorthandEndPos !== currentPos) {
              this.tokenChar += shorthandEndPos + 1 - currentPos;
              currentPos = shorthandEndPos + 1;

              // The closing tag can be omitted when styling a single word. This can be done by making
              // sure no whitespace exists between the opening tag and the word.
              // Whitespace should always be present after the opening tag if a closing tag is desired.
              let newPos = this.pushConnectedSourceUntil(/\s/, input, currentPos, tokens);
              this.tokenChar += newPos - currentPos;
              currentPos = newPos;
              continue;
            }
          }
          // Check for frostlining footnotes: '<& [text] | [text] &>
          else if (nextChar === '&') {
            this.pushToken(tokens, {type: 'fl-footnote-start', value: '<&', pos: [this.tokenLine, this.tokenChar]});
            currentPos += 2;
            this.tokenChar += 2;
            continue;
          }
          // Check for frostlining glue: '<>'
          else if (nextChar === '>') {
            this.pushToken(tokens, {type: 'fl-glue', value: '<>', pos: [this.tokenLine, this.tokenChar]});
            currentPos += 2;
            this.tokenChar += 2;
            continue;
          }
        }
      }

      // == Underscore tags
      // Opening tags
      if (char === '<' && this.nextCharMatches('%', currentPos, input)) {
        // interpolate tag
        if (this.nextCharMatches('=', currentPos + 1, input)) {
          this.pushToken(tokens, {type: "underscore-interp-start", value: "<%=", pos: [this.tokenLine, this.tokenChar]});
          currentPos += 3;
          this.tokenChar += 3;
          continue;
        }
        else if (this.nextCharMatches('-', currentPos + 1, input)) {
          this.pushToken(tokens, {type: "underscore-interp-esc-start", value: "<%-", pos: [this.tokenLine, this.tokenChar]});
          currentPos += 3;
          this.tokenChar += 3;
          continue;
        }
        // basic '<%' opening tag
        else {
          this.pushToken(tokens, {type: "underscore-start", value: "<%", pos: [this.tokenLine, this.tokenChar]});
          currentPos += 2;
          this.tokenChar += 2;
          continue;
        }
      }
      // closing '%>' tag
      if (char === '%' && this.nextCharMatches('>', currentPos, input)) {
        this.pushToken(tokens, {type: 'underscore-end', value: '%>', pos: [this.tokenLine, this.tokenChar]})
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }

      // == Twine links
      if (char === '[') {
        if (this.nextCharMatches('[', currentPos, input)) {
          this.pushToken(tokens, {type: 'tw-link-start', value: '[[', pos: [this.tokenLine, this.tokenChar]});
          currentPos += 2;
          this.tokenChar += 2;
          continue;
        } else {
          this.pushToken(tokens, {type: 'sq-bracket-open', value: '[', pos: [this.tokenLine, this.tokenChar]})
          currentPos += 1;
          this.tokenChar += 1;
          continue;
        }
      }
      else if (char === ']') {
        if (this.nextCharMatches(']', currentPos, input)) {
          this.pushToken(tokens, {type: 'tw-link-end', value: ']]', pos: [this.tokenLine, this.tokenChar]});
          currentPos += 2;
          this.tokenChar += 2;
          continue;
        } else {
          this.pushToken(tokens, {type: 'sq-bracket-closed', value: ']'})
          currentPos += 1;
          this.tokenChar += 1;
          continue;
        }
      }
      else if (char === '-' && this.nextCharMatches('>', currentPos, input)) {
        this.pushToken(tokens, {type: 'arrow', value: '->', pos: [this.tokenLine, this.tokenChar]});
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }
      else if (char === '<' && this.nextCharMatches('-', currentPos, input)) {
        this.pushToken(tokens, {type: 'rev-arrow', value: '<-', pos: [this.tokenLine, this.tokenChar]});
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }

      // Note any pipe tokens -- relevant for frostling conditional statements
      if (char === '|') {
        this.pushToken(tokens, {type: 'pipe', value: '|', pos: [this.tokenLine, this.tokenChar]})
        currentPos += 1;
        this.tokenChar += 1;
        continue;
      }

      // Note any double semicolons -- used to separate lines in dialogue sections
      if (char === ';' && this.nextCharMatches(';', currentPos, input)) {
        this.pushToken(tokens, {type: 'dialogue-break', value: ';;', pos: [this.tokenLine, this.tokenChar]})
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }

      /*
       * Possible closing template tags
       */
      // Check for frostlining conditional:  '?>'
      if (char === '?' && this.nextCharMatches('>', currentPos, input)) {
        this.pushToken(tokens, {type: 'fl-conditional-end', value: '?>', pos: [this.tokenLine, this.tokenChar]})
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }
      // Check for frostlining html-shorthand:  ':>'
      else if (char === ':' && this.nextCharMatches('>', currentPos, input)) {
        this.pushToken(tokens, {type: 'fl-html-end', value: ':>', pos: [this.tokenLine, this.tokenChar]})
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }
      // check for frostlining footnotes: '&>'
      else if (char === '&' && this.nextCharMatches('>', currentPos, input)) {
        this.pushToken(tokens, {type: 'fl-footnote-end', value: '&>', pos: [this.tokenLine, this.tokenChar]});
        currentPos += 2;
        this.tokenChar += 2;
        continue;
      }
      // Check for frostlining dialogue end: '>>>'
      if (char === '>' &&
          this.nextCharMatches('>', currentPos, input) &&
          this.nextCharMatches('>', currentPos + 1, input)) {
        this.pushToken(tokens, {type: 'fl-dialogue-end', value: '>>>', pos: [this.tokenLine, this.tokenChar]})
        currentPos += 3;
        this.tokenChar += 3;
        continue;
      }

      // No matches found -- just append this to workingText
      this.workingText += char;
      currentPos += 1;
      this.tokenChar += 1;
    }

    // Flush working text before returning the tokens.
    if (this.workingText.length > 0) {
      let text = this.workingText.trim();
      if (text.length > 0) {
        tokens.push({type: 'source', value: text, pos: [this.tokenLine, this.tokenChar]})
      }
      this.workingText = ''
    }

    return tokens;
  }

  pushConnectedSourceUntil(regex, input, currentPos, tokens, tokenType = 'word') {
    if (/\s/.test(input[[currentPos]])) {
      return currentPos;
    }
    return this.pushSourceUntil(regex, input, currentPos, tokens, tokenType);
  }

  pushSourceUntil(regex, input, currentPos, tokens, tokenType = 'source', pushOnZeroLength = false) {
    let nextPos = currentPos;
    let value = ''

    let sourceStarted = false;
    while (nextPos < input.length) {
      if (sourceStarted) {
        if (!regex.test(input[nextPos])) {
          value += input[nextPos];
          nextPos += 1;
        } else {
          break;
        }
      } else {
        if (this.INLINE_WS.test(input[nextPos])) {
          nextPos += 1;
          continue;
        }
        // If a newline is found before the source starts, skip the
        // processing entirely.
        else if (this.NEWLINE_WS.test(input[nextPos])) {
          return currentPos;
        }

        sourceStarted = true;
      }
    }

    if (value.length > 0 || pushOnZeroLength) {
      this.pushToken(tokens, {type: tokenType, value: value.trim(), pos: [this.tokenLine, this.tokenChar] })
      return nextPos;
    } else {
      return currentPos;
    }
  }


  pushToken(tokens, token) {
    // flush any working tokens.
    let text = this.workingText.trim();
    if (text.length > 0) {
      tokens.push({type: 'source', value: text, pos: [this.tokenLine, this.tokenChar]})
    }
    this.workingText = ''
    tokens.push(token);
  }

  nextCharMatches(char, position, input) {
    return position + 1 < input.length && input[position+1] === char
  }
}