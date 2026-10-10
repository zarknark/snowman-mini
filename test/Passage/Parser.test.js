import Parser from '../../lib/passage/Parser.js';
import $ from 'jquery';

// Mock window.story.state for _.template
global.window = {};
window.story = { state: { foo: 'bar', testVar: 'testValue' } };

// Mock jQuery event trigger
$.event = { trigger: jest.fn() };

describe('Parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set default values if no arguments are provided', () => {
      const parser = new Parser();
      expect(parser.workingText).toBe('');
      expect(parser.INLINE_WS).toEqual(/[ \t]/);
      expect(parser.NEWLINE_WS).toEqual(/[\r\n]/);
      expect(parser.SHORTHAND_CHARS).toEqual(/[A-Za-z-_.# ]/);
    });
  });

  describe('tokenizer', () => {
    describe('whitespace parsing', () => {
      it('should return no tokens if input only contains inline whitespace', () => {
        const parser = new Parser();

        let tokens = parser.tokenize("   ");
        expect(tokens.length).toBe(0);

        tokens = parser.tokenize("\t \t");
        expect(tokens.length).toBe(0);
      });

      it('should return all newlines', () => {
        const parser = new Parser();

        let input = "\n\n\n"
        let tokens

        tokens = parser.tokenize(input);
        expect(tokens.length).toBe(3);
        tokens.forEach( (token) => { expect(token).toMatchObject({type: 'newline', value: '\n'}) })

        tokens = parser.tokenize(input);
        expect(tokens.length).toBe(3);
        tokens.forEach( (token) => { expect(token).toMatchObject({type: 'newline', value: '\n'}) })
      });

      it('should omit all whitespace between newlines', () => {
        const parser = new Parser();

        let input = "\n   \n\t\t\t\n"
        let tokens

        tokens = parser.tokenize(input);
        expect(tokens.length).toBe(3);
        tokens.forEach( (token) => { expect(token).toMatchObject({type: 'newline', value: '\n'}) })
      });
    });

    describe('Underscore parsing', () => {
      it('should recognize basic opening and closing tags', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("<%%>");

        expect(tokens.length).toBe(2);
        expect(tokens[0]).toStrictEqual({type: 'underscore-start', value: '<%', pos: [0,0]});
        expect(tokens[1]).toStrictEqual({type: 'underscore-end', value: '%>', pos: [0,2]});

        tokens = parser.tokenize("<% print('Hello World') %>");
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toMatchObject({type: 'underscore-start', value: '<%'});
        expect(tokens[1]).toMatchObject({type: 'source', value: 'print(\'Hello World\')'});
        expect(tokens[2]).toMatchObject({type: 'underscore-end', value: '%>'});

      });

      it('should recognize interpolate-type opening tags', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("<%=%>");

        expect(tokens.length).toBe(2);
        expect(tokens[0]).toMatchObject({type: 'underscore-interp-start', value: '<%='});
        expect(tokens[1]).toMatchObject({type: 'underscore-end', value: '%>'});

        tokens = parser.tokenize("<%= story.helloWorld %>");
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toMatchObject({type: 'underscore-interp-start', value: '<%='});
        expect(tokens[1]).toMatchObject({type: 'source', value: 'story.helloWorld'});
        expect(tokens[2]).toMatchObject({type: 'underscore-end', value: '%>'});
      })

      it('should recognize interpolate-and-escape-type opening tags', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("<%-%>");

        expect(tokens.length).toBe(2);
        expect(tokens[0]).toMatchObject({type: 'underscore-interp-esc-start', value: '<%-'});
        expect(tokens[1]).toMatchObject({type: 'underscore-end', value: '%>'});

        tokens = parser.tokenize("<%- <br>\n story.helloWorld <br> \n%>");
        expect(tokens.length).toBe(6);
        expect(tokens[0]).toMatchObject({type: 'underscore-interp-esc-start', value: '<%-'});
        expect(tokens[1]).toMatchObject({type: 'source', value: '<br>'});
        expect(tokens[2]).toMatchObject({type: 'newline', value: '\n'});
        expect(tokens[3]).toMatchObject({type: 'source', value: 'story.helloWorld <br>'});
        expect(tokens[4]).toMatchObject({type: 'newline', value: '\n'});
        expect(tokens[5]).toMatchObject({type: 'underscore-end', value: '%>'});
      })
    });

    describe('Link parsing', () => {
      it('should parse normal links', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("[[source|dest_passage]]");

        expect(tokens.length).toBe(5);
        expect(tokens[0]).toMatchObject({type: 'tw-link-start', value: '[['});
        expect(tokens[1]).toMatchObject({type: 'source', value: 'source'});
        expect(tokens[2]).toMatchObject({type: 'pipe', value: '|'});
        expect(tokens[3]).toMatchObject({type: 'source', value: 'dest_passage'});
        expect(tokens[4]).toMatchObject({type: 'tw-link-end', value: ']]'});
      })

      it('should parse arrow links', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("[[source->dest_passage]]");

        expect(tokens.length).toBe(5);
        expect(tokens[0]).toMatchObject({type: 'tw-link-start', value: '[['});
        expect(tokens[1]).toMatchObject({type: 'source', value: 'source'});
        expect(tokens[2]).toMatchObject({type: 'arrow', value: '->'});
        expect(tokens[3]).toMatchObject({type: 'source', value: 'dest_passage'});
        expect(tokens[4]).toMatchObject({type: 'tw-link-end', value: ']]'});
      })

      it('should parse destination-only links', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("[[dest_passage]]");

        expect(tokens.length).toBe(3);
        expect(tokens[0]).toMatchObject({type: 'tw-link-start', value: '[['});
        expect(tokens[1]).toMatchObject({type: 'source', value: 'dest_passage'});
        expect(tokens[2]).toMatchObject({type: 'tw-link-end', value: ']]'});
      })

      it('should parse embed links', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("[[dest_passage<-source]]");

        expect(tokens.length).toBe(5);
        expect(tokens[0]).toMatchObject({type: 'tw-link-start', value: '[['});
        expect(tokens[1]).toMatchObject({type: 'source', value: 'dest_passage'});
        expect(tokens[2]).toMatchObject({type: 'rev-arrow', value: '<-'});
        expect(tokens[3]).toMatchObject({type: 'source', value: 'source'});
        expect(tokens[4]).toMatchObject({type: 'tw-link-end', value: ']]'});
      })
    });


    describe('Frostlining parsing', () => {
      // '<|[var_name]'
      it('should parse varname tags with words', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("<|variable-name");

        expect(tokens.length).toBe(2);
        expect(tokens[0]).toMatchObject({type: 'fl-variable', value: '<|'});
        expect(tokens[1]).toMatchObject({type: 'word', value: 'variable-name'});

        tokens = parser.tokenize("<| variable-name \n\n");
        expect(tokens.length).toBe(4);
        expect(tokens[0]).toMatchObject({type: 'fl-variable', value: '<|'});
        expect(tokens[1]).toMatchObject({type: 'word', value: 'variable-name'});
        expect(tokens[2]).toMatchObject({type: 'newline', value: '\n'});
        expect(tokens[3]).toMatchObject({type: 'newline', value: '\n'});
      })

      it('should not parse words when newlines follow a varname tag', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("<|\n\nvariable-name ");

        expect(tokens.length).toBe(4);
        expect(tokens[0]).toMatchObject({type: 'fl-variable', value: '<|'});
        expect(tokens[1]).toMatchObject({type: 'newline', value: '\n'});
        expect(tokens[2]).toMatchObject({type: 'newline', value: '\n'});
        expect(tokens[3]).toMatchObject({type: 'source', value: 'variable-name'});

        tokens = parser.tokenize("<| \nvariable-name ");
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toMatchObject({type: 'fl-variable', value: '<|'});
        expect(tokens[1]).toMatchObject({type: 'newline', value: '\n'});
        expect(tokens[2]).toMatchObject({type: 'source', value: 'variable-name'});
      })

      // Conditional tags
      it('should parse basic conditional text', () => {
        const parser = new Parser();
        let tokens = parser.tokenize(
            "<? hour === 'midnight' ? The clock struck twelve. ?>");

        expect(tokens.length).toBe(3);
        expect(tokens[0]).toMatchObject({type: 'fl-conditional-start', value: 'hour === \'midnight\''})
        expect(tokens[1]).toMatchObject({type: 'source', value: 'The clock struck twelve.'})
        expect(tokens[2]).toMatchObject({type: 'fl-conditional-end', value: '?>'})
      })

      it('should parse conditional text with else statements', () => {
        const parser = new Parser();
        let tokens = parser.tokenize(
            "<? hour === 'midnight' ? The clock struck twelve. | The clock ticked quietly. ?>");

        expect(tokens.length).toBe(5);
        expect(tokens[0]).toMatchObject({type: 'fl-conditional-start', value: 'hour === \'midnight\''})
        expect(tokens[1]).toMatchObject({type: 'source', value: 'The clock struck twelve.'})
        expect(tokens[2]).toMatchObject({type: 'pipe', value: '|'})
        expect(tokens[3]).toMatchObject({type: 'source', value: 'The clock ticked quietly.'})
        expect(tokens[4]).toMatchObject({type: 'fl-conditional-end', value: '?>'})
      })

      // HTML shorthand: '<:[html-shorthand]:' ':>'
      it('should parse basic html shorthand', () => {
        const parser = new Parser();
        let tokens = parser.tokenize("<:em: The clock struck twelve. :>");

        expect(tokens.length).toBe(4);
        expect(tokens[0]).toMatchObject({type: 'fl-html-start', value: 'em'})
        expect(tokens[1]).toMatchObject({type: 'word', value: 'The'})
        expect(tokens[2]).toMatchObject({type: 'source', value: 'clock struck twelve.'})
        expect(tokens[3]).toMatchObject({type: 'fl-html-end', value: ':>'})

        tokens = parser.tokenize("<:p.fl-hidden: The clock ticked quietly. :>");

        expect(tokens.length).toBe(4);
        expect(tokens[0]).toMatchObject({type: 'fl-html-start', value: 'p.fl-hidden'})
        expect(tokens[1]).toMatchObject({type: 'word', value: 'The'})
        expect(tokens[2]).toMatchObject({type: 'source', value: 'clock ticked quietly.'})
        expect(tokens[3]).toMatchObject({type: 'fl-html-end', value: ':>'})
      })

      // Click-for-footnote: '<& [ source ] | footnote &>'
      it('parses footnotes correctly', () => {
        const parser = new Parser();
        let tokens = parser.tokenize(
            "He muttered, \"I'm from <& England | England: a foreign country far across the sea. &>.\"");

        expect(tokens.length).toBe(7);
        expect(tokens[0]).toMatchObject({type: 'source', value: 'He muttered, "I\'m from'});
        expect(tokens[1]).toMatchObject({type: 'fl-footnote-start', value: '<&'});
        expect(tokens[2]).toMatchObject({type: 'source', value: 'England'});
        expect(tokens[3]).toMatchObject({type: 'pipe', value: '|'});
        expect(tokens[4]).toMatchObject({type: 'source', value: 'England: a foreign country far across the sea.'});
        expect(tokens[5]).toMatchObject({type: 'fl-footnote-end', value: '&>'});
        expect(tokens[6]).toMatchObject({type: 'source', value: '."'});
      })
    });

    // DO THIS ONLY AFTER MAKING SURE BASIC PASSAGE FUNCTIONALITY WORKS.
    describe('Frostlining dialogue parsing', () => {
      // '<<<' '>>>' (start / end dialogue section)

      // ';;' (dialogue break)

      // '<>' (glue)

      // '==' (knots)

      // '*' '**' ... (choices)

      // '-' '--' ... (gathers)

      // '-> <knot-name>' (diverts)

      // '* <source> [ <source> ]' '** <source> [ <source> ]' ... (choice-only text)

      // '* -> <knot>' '** -> <knot>' '*** -> <knot>' (fallback choice)

      // '* <? condition ? <source>'
      // '** <? condition ? <source>'
      // '*** <? condition ? <source>'
      // (conditional choice)
    });

    describe('HTML parsing (or the lack of it)', () => {
      it('should pass all valid HTML elements through as text', () => {
        const parser = new Parser();

        // Several test cases taken from https://demodorigatsuo.github.io/minisoup-test-site/index.html
        let inputAndResult = [
          {
            input: "<a href='https://example.com'>test-link<\\a>",
            expected: [ { type: 'source', value: "<a href='https://example.com'>test-link<\\a>" } ]
          },
          {
            input: "<h1 className='title' id='main-title'>H1 Heading</h1>",
            expected: [ { type: 'source', value: "<h1 className='title' id='main-title'>H1 Heading</h1>" } ]
          },
          {
            input: "<p id='second-para'>This is the second paragraph. It includes <strong>bold</strong> and <em>emphasized</em> text.</p>\n<p data-test='paragraph-with-data'>This paragraph has a data attribute.</p>",
            expected: [
              { type: 'source', value: "<p id='second-para'>This is the second paragraph. It includes <strong>bold</strong> and <em>emphasized</em> text.</p>" },
              { type: 'newline', value: "\n" },
              { type: 'source', value: "<p data-test='paragraph-with-data'>This paragraph has a data attribute.</p>"}
            ]
          },
          {
            input: "" +
                "            <h2>Deeply Nested Elements</h2>\n" +
                "            <div class='level-1'>\n" +
                "                <div class='level-2'>\n" +
                "                    <div class='level-3'>\n" +
                "                        <div class='level-4'>\n" +
                "                            <div class='level-5'>\n" +
                "                                <p class='deep-text'>This text is nested 5 levels deep</p>\n" +
                "                            </div>\n" +
                "                        </div>\n" +
                "                    </div>\n" +
                "                </div>\n" +
                "            </div>\n" +
                "            <p>Selector challenge: <code>.level-1 .level-3 .level-5 p</code></p>",
            expected: [
              { type: 'source', value: "<h2>Deeply Nested Elements</h2>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<div class='level-1'>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<div class='level-2'>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<div class='level-3'>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<div class='level-4'>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<div class='level-5'>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<p class='deep-text'>This text is nested 5 levels deep</p>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "</div>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "</div>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "</div>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "</div>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "</div>" }, { type: 'newline', value: "\n" },
              { type: 'source', value: "<p>Selector challenge: <code>.level-1 .level-3 .level-5 p</code></p>" },
            ]
          }
        ]
        inputAndResult.forEach((item) => {
          let tokens = parser.tokenize(item.input)
          expect(tokens).toMatchObject(item.expected)
        });
      });
    });

    describe('complex parsing tests', () => {
      it('should correctly parse a passage with multiple different types of tags, some of them nested.', () => {
        const parser = new Parser();
        const input =
            `<? _previousRoom === 'Outside' ? Shaking the rain from your [[cloak->Cloak]], you step gratefully inside. ?> 
            
            You are standing in a <& spacious hall | It is splendidly decorated in red and gold, with glittering chandeliers overhead &>.
            
            The entrance from the street is to the [[north->Outside]], and there are doorways [[south->Bar]] and [[west->Cloakroom]]."`

        let tokens = parser.tokenize(input);
        expect(tokens.length).toBe(39);
        expect(tokens[0]).toMatchObject({type: 'fl-conditional-start', value: '_previousRoom === \'Outside\''})
        expect(tokens[1]).toMatchObject({type: 'source', value: 'Shaking the rain from your'})
        expect(tokens[2]).toMatchObject({type: 'tw-link-start', value: '[['})
        expect(tokens[3]).toMatchObject({type: 'source', value: 'cloak'})
        expect(tokens[4]).toMatchObject({type: 'arrow', value: '->'})
        expect(tokens[5]).toMatchObject({type: 'source', value: 'Cloak'})
        expect(tokens[6]).toMatchObject({type: 'tw-link-end', value: ']]'})
        expect(tokens[7]).toMatchObject({type: 'source', value: ', you step gratefully inside.'})
        expect(tokens[8]).toMatchObject({type: 'fl-conditional-end', value: '?>'})
      })
    })
  });

  describe('ast-creation', () => {
    describe('valid input tests', () => {
      it("should handle basic underscore templating", () => {
        const parser = new Parser();

        let input = '<% if (s.hour === "midnight") { %>';
        let tokens = parser.tokenize(input);
        let ast = parser.toAst(tokens);

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'UnderscoreTemplate',
              children: [
                {
                  type: 'Source',
                  value: 'if (s.hour === "midnight") {'
                }]
            }]
        });

        input = 'Hello, <%= getName() %>';
        tokens = parser.tokenize(input);
        ast = parser.toAst(tokens);

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'Source',
              value: 'Hello,'
            },
            {
              type: 'UnderscoreInterpolate',
              children: [
                {
                  type: 'Source',
                  value: 'getName()'
                }
              ]
            }]
        });

        input = '<%- getModalSource() %>';
        tokens = parser.tokenize(input);
        ast = parser.toAst(tokens);

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'UnderscoreInterpolateEscaped',
              children: [
                {
                  type: 'Source',
                  value: 'getModalSource()'
                }
              ]
            }]
        });
      })

      it("should handle Twine links", () => {
        const parser = new Parser()

        let input = '[[One Fish|one]], [[Two Fish->two]], [[Red Fish]], [[blue<-Blue Fish]]';
        let ast = parser.toAst(parser.tokenize(input));

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'TwineLink',
              label: [{type: 'Source', value: 'One Fish'}],
              passage: [{type: 'Source', value: 'one'}],
              isEmbed: false
            },
            { type: 'Source', value: ',' },
            {
              type: 'TwineLink',
              label: [{type: 'Source', value: 'Two Fish'}],
              passage: [{type: 'Source', value: 'two'}],
              isEmbed: false
            },
            { type: 'Source', value: ',' },
            {
              type: 'TwineLink',
              label: [],
              passage: [{type: 'Source', value: 'Red Fish'}],
              isEmbed: false
            },
            { type: 'Source', value: ',' },
            {
              type: 'TwineLink',
              label: [{type: 'Source', value: 'Blue Fish'}],
              passage: [{type: 'Source', value: 'blue'}],
              isEmbed: true
            }
          ]
        });
      });

      it("should hande variable markup", () => {
        const parser = new Parser()

        let input = 'Hello, <|user.name !'
        let ast = parser.toAst(parser.tokenize(input));

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            { type: 'Source', value: 'Hello,' },
            {
              type: 'FrostliningInterpolate',
              var_name: 'user.name'
            },
            { type: 'Source', value: '!' }
          ]
        });
      });

      it("should handle basic conditional statements", () => {
        const parser = new Parser()

        let input = '<? s.hour === "midnight" ? The clock struck midnight. ?>'
        let ast = parser.toAst(parser.tokenize(input));

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'FrostliningConditional',
              conditional: 's.hour === "midnight"',
              ifChildren: [{
                type: 'Source',
                value: 'The clock struck midnight.'
              }],
              elseChildren: []
            }
          ]
        })

        input = '<? s.hour === "midnight" ? The clock struck midnight. | The clock ticked quietly. ?>'
        ast = parser.toAst(parser.tokenize(input));

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'FrostliningConditional',
              conditional: 's.hour === "midnight"',
              ifChildren: [{
                type: 'Source',
                value: 'The clock struck midnight.'
              }],
              elseChildren: [{
                type: 'Source',
                value: 'The clock ticked quietly.'
              }]
            }
          ]
        });
      });

      it("should handle frostlining html shorthand", () => {
        const parser = new Parser()

        let input = `
        <:.chapter-start#start.text:
          In my younger and more vulnerable years my father gave me some advice
          that I’ve been turning over in my mind ever since.
        :>
        <::
          "Whenever you feel like criticizing anyone," he told me, "just remember
           that all the people in this world haven't had the advantages that 
           you've had."     
        :>`;
        let ast = parser.toAst(parser.tokenize(input));
        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {type: 'Newline', value: '\n'},
            {
              type: 'FrostliningHtmlShorthand',
              tag: 'p',
              id: 'start',
              classes: ['chapter-start', 'text'],
              children: [
                {type: 'Newline', value: '\n'},
                {type: 'Source', value: 'In my younger and more vulnerable years my father gave me some advice'},
                {type: 'Newline', value: '\n'},
                {type: 'Source', value: 'that I’ve been turning over in my mind ever since.'},
                {type: 'Newline', value: '\n'},
              ]
            },
            {type: 'Newline', value: '\n'},
            {
              type: 'FrostliningHtmlShorthand',
              tag: 'p',
              id: '',
              classes: [],
              children: [
                {type: 'Newline', value: '\n'},
                {type: 'Source', value: '"Whenever you feel like criticizing anyone," he told me, "just remember'},
                {type: 'Newline', value: '\n'},
                {type: 'Source', value: 'that all the people in this world haven\'t had the advantages that'},
                {type: 'Newline', value: '\n'},
                {type: 'Source', value: 'you\'ve had."'},
                {type: 'Newline', value: '\n'},
              ]
            }
          ]
        })

        input = `
        <:: Because she loved you so :>
        <:: Pretty as a picture that you <:em: didn't post :> :>
        <:: Lookin' at you like you're made of <:em: solid gold :> :>
        <:: Never <:em:official / You mention you're <:em:single to the girls at the bar :>
        <:: And you hate this song :>
        <:: But you wake up on the train with your <:em: headphones gone :> :>
        <:: Then that melody is <:em: all you want :> :>
        <:: You never knew that it was <:em:Babylon / 'Til it was gone :>
        `
        ast = parser.toAst(parser.tokenize(input));
        expect(ast.body.length).toBe(17);
        expect(ast.body[0]).toStrictEqual({type: 'Newline', value: '\n'});
        expect(ast.body[1]).toStrictEqual({
          type: 'FrostliningHtmlShorthand',
          tag: 'p',
          id: '',
          classes: [],
          children: [{type: 'Source', value: 'Because she loved you so'}]
        });
        expect(ast.body[3]).toStrictEqual({
          type: 'FrostliningHtmlShorthand',
          tag: 'p',
          id: '',
          classes: [],
          children: [
            {type: 'Source', value: 'Pretty as a picture that you'},
            {
              type: 'FrostliningHtmlShorthand',
              tag: 'em',
              id: '',
              classes: [],
              children: [{type: 'Source', value: 'didn\'t post'}]
            }
          ]
        });
        expect(ast.body[7]).toStrictEqual({
          type: 'FrostliningHtmlShorthand',
          tag: 'p',
          id: '',
          classes: [],
          children: [
            {type: 'Source', value: 'Never'},
            {
              type: 'FrostliningHtmlShorthand',
              tag: 'em',
              id: '',
              classes: [],
              children: [{type: 'Source', value: 'official'}]
            },
            {type: 'Source', value: '/ You mention you\'re'},
            {
              type: 'FrostliningHtmlShorthand',
              tag: 'em',
              id: '',
              classes: [],
              children: [{type: 'Source', value: 'single'}]
            },
            {type: 'Source', value: 'to the girls at the bar'}
          ]
        });
      });

      it("should handle frostlining footnotes", () => {
        const parser = new Parser()

        let input = '<& Click me! | Your computer is now infected with chlamydia. &>';
        let ast = parser.toAst(parser.tokenize(input));

        expect(ast).toStrictEqual({
          type: 'Passage',
          body: [
            {
              type: 'FrostliningFootnote',
              label: [{ type: 'Source', value: 'Click me!' }],
              children: [{ type: 'Source', value: 'Your computer is now infected with chlamydia.'}]
            }
          ]
        })
      });
    })

    // TODO: describe('invalid input tests', () => {})
  })
});
