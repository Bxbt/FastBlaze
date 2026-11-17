// Starter snippets created on first install.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  FB.DEFAULT_SETTINGS = {
    highlight: true, // yellow flash on clicked elements
    stepDelay: 60, // ms pause after each click / key
    timeout: 5000, // ms to wait for an element to appear
    soundVolume: 40, // 0-100 key-click sound when a snippet runs (0 = off)
  };

  FB.DEFAULT_DATA = {
    version: 1,
    folders: [
      {
        id: 'examples',
        name: 'Examples',
        snippets: [
          { id: 'ex-thaiid', name: 'Thai ID (test)', shortcut: '/thid', text: '{thaiid}' },
          { id: 'ex-thaiid8', name: 'Thai ID starting with 8', shortcut: '/thid8', text: '{thaiid: prefix=8}' },
          { id: 'ex-zip', name: 'Zipcode', shortcut: '/zip', text: '10200' },
          { id: 'ex-thaiid-dash', name: 'Thai ID with dashes', shortcut: '/thidd', text: '{thaiid: format=dash}' },
          { id: 'ex-hello', name: 'Greeting with form', shortcut: '/hi', text: 'สวัสดีคุณ {formtext: name=ชื่อ; default=ทดสอบ} ยินดีต้อนรับครับ' },
          { id: 'ex-math', name: 'Variables + math', shortcut: '/calc', text: '{a={random-number: min=1; max=9}}{b={random-number: min=1; max=9}}{=a} x {=b} = {=a*b}' },
          {
            id: 'ex-demo',
            name: 'Demo: fill test page',
            shortcut: '/demo',
            text: '{click: selector=[data-testid="input-first-name"]}{formtext: name=firstname; default=ทดสอบ}'
              + '{click: selector=[data-testid="input-last-name"]}เท่านั้น'
              + '{click: selector=[data-testid="input-id-card-number"]}{thaiid}'
              + '{click: selector=[data-testid="select-sub-district"]}{click: selector=.overflow-auto > :nth-child(2)}',
          },
        ],
      },
    ],
  };
})();
