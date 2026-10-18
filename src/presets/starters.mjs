// SPDX-License-Identifier: AGPL-3.0-only
const svg = (body, background = '#eaf2ed') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><rect width="240" height="240" rx="120" fill="' + background + '"/>' + body + '</svg>';
const art = {
  cv: svg('<path d="M50 173V90l70-40 70 40v83l-70 26z" fill="#22564d"/><path d="m77 121 29 29 58-62" fill="none" stroke="#f2ce7d" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>'),
  menu: svg('<path d="M45 151c-12-65 67-107 119-67 57 44 20 110-36 112-43 1-75-9-83-45" fill="#dc704e"/><path d="M123 92c-15-40 9-57 43-57-2 30-15 48-43 57" fill="#27584b"/><path d="M81 128c14-22 49-30 72-7M76 154c25 17 47 17 74 0" fill="none" stroke="#fff2d5" stroke-width="10" stroke-linecap="round"/>', '#fff0d5'),
  invitation: svg('<path d="M40 94h160v100H40z" fill="#4b5b91"/><path d="m40 94 80 61 80-61-80-58z" fill="#e4b7bc"/><path d="m40 194 80-64 80 64" fill="#7987bb"/><circle cx="120" cy="76" r="28" fill="#f5d482"/><path d="M120 34v-15m0 114v-15M78 76H63m114 0h-15M90 46 79 35m82 82-11-11m0-60 11-11M79 117l11-11" stroke="#b4773b" stroke-width="5"/>', '#f3eaf3'),
  lesson: svg('<path d="M61 190V74l59-34 59 34v116" fill="#2a6870"/><path d="m61 74 59 38 59-38M120 112v83" fill="none" stroke="#f9d47d" stroke-width="9"/><circle cx="120" cy="147" r="21" fill="#ed9571"/><path d="m120 34 0-12M42 67 29 61m169 6 13-6" stroke="#2a6870" stroke-width="6" stroke-linecap="round"/>'),
  social: svg('<path d="M29 122c0-51 41-91 91-91s91 40 91 91-41 89-91 89-91-38-91-89" fill="#ec956e"/><path d="M59 148v-44h30v44m16 0V74h30v74m16 0v-24h30v24" fill="#392d55"/><path d="M59 168h122" stroke="#fff1d6" stroke-width="9" stroke-linecap="round"/>', '#f5e9dd'),
  brief: svg('<path d="M49 57h141v131H49z" fill="#2e6357"/><path d="M72 87h94M72 119h57M72 151h30" stroke="#f6df9a" stroke-width="10"/><path d="m128 175 36-35 34 35-34 35z" fill="#df9473"/>'),
  recipe: svg('<path d="M33 127h174c-4 50-38 76-87 76s-84-26-87-76" fill="#bc603e"/><path d="M45 126c3-42 145-42 150 0" fill="#f8d486"/><path d="M78 114c-15-41 6-59 41-63-1 30-13 52-41 63m41 4c-1-38 23-56 55-47-10 28-28 44-55 47" fill="#356c4d"/><path d="M88 39c-12-18 12-21 0-38M139 41c-12-18 12-21 0-38" fill="none" stroke="#bc603e" stroke-width="5" stroke-linecap="round"/>', '#fff0d5'),
  poster: svg('<path d="M35 171V91h31v80m16 0V56h31v115m17 0V81h31v90m17 0V35h27v136" fill="#1c5c62"/><circle cx="51" cy="69" r="15" fill="#df765a"/><circle cx="97" cy="34" r="15" fill="#df765a"/><circle cx="145" cy="59" r="15" fill="#df765a"/><path d="M35 195h170" stroke="#d1a949" stroke-width="9" stroke-linecap="round"/>', '#f7edcf'),
};
const records = [
  ['cv', 'CV · Clear direction', 'A concise profile with room for evidence.',
`# Maya Chen

**Product designer · Research into useful things**

@ART@

I make complex services feel straightforward. My work brings research, clear writing and careful interaction design into one conversation.

[maya@example.com](mailto:maya@example.com) · Bristol, UK

## Selected experience

| When | Where |
| :--- | :--- |
| 2023–now | North Studio |
| 2020–2023 | Common Works |

**North Studio · Senior designer.** Led a service redesign from interviews to launch; cut onboarding from nine steps to four.

**Common Works · Designer.** Built an accessible component library used by three product teams.

## How I work

**Listen closely.** Test the problem before drawing the solution. **Make it tangible.** Prototype early; write alongside the design. **Leave it better.** Share decisions, evidence and reusable tools.

## Education & practice

BA Interaction Design · 2020 Accessibility, facilitation, prototyping and a good field notebook.
`],
  ['menu', 'Menu · The small table', 'Seasonal plates, clear prices, a warm welcome.',
`# The small table

**A little seasonal kitchen**

@ART@

Lunch is a chance to pause. Everything here is made in small batches, with vegetables from nearby growers and bread baked each morning.

Tuesday–Saturday · 12–3 pm

## From the kitchen

| Plate | £ |
| :--- | ---: |
| Tomato toast | 9 |
| Green grain bowl | 12 |
| Soup & warm bread | 8 |

Tomato toast comes with whipped white beans and basil. The grain bowl brings barley, peas and herbs together with a lemon dressing.

## Something sweet

| A small finish | £ |
| :--- | ---: |
| Olive oil cake | 5 |
| Espresso / filter | 3 |
| Sparkling elderflower | 4 |

> Tell us about allergies before ordering. We will help you choose.

**Good food. An unhurried hour.**
`],
  ['invitation', 'Invitation · A golden evening', 'A personal gathering with the essentials in one place.',
`# Stay for the sunset

**An evening in good company**

@ART@

We are setting a long table, putting something good on the stove and making room for the people we love. Come as you are; stay a little longer.

## You are invited

| The plan | The details |
| :--- | :--- |
| When | 19 June · 6 pm |
| Where | 14 Willow Lane |
| Bring | A warm layer |
| Reply by | 10 June |

RSVP to [hello@example.com](mailto:hello@example.com). Bring a story for the table.

### A loose itinerary

**6 pm** · Drinks in the garden **7 pm** · Supper at the long table **Afterwards** · Music, conversation, one more slice

Rain only changes the room. Please mention any dietary or access needs when you reply.

*With love, Sam & Alex*
`],
  ['lesson', 'Lesson card · Notice the pattern', 'One concept, a small experiment, a useful reflection.',
`# Small patterns, big ideas

**Maths lab · 20 minutes · Ages 9–12**

@ART@

A pattern is a rule you can test. Today, turn a row of dots into a prediction, then explain why it works.

**You need:** paper, a pencil and a handful of counters.

## Try it

1. Make a square with 1 counter. Then use 4, then 9.
2. Sketch the next two squares before counting.
3. Describe what you add each time.

| Side length | Counters | Added |
| ---: | ---: | ---: |
| 1 | 1 | 1 |
| 2 | 4 | 3 |
| 3 | 9 | 5 |
| 4 | ? | ? |
| 5 | ? | ? |

## Explain your thinking

Why are the added numbers odd? Draw the new edge in a different colour. Use your picture to predict a square with a side of 10.

> **Exit ticket:** “I used to think … Now I notice …”

**For the facilitator:** listen for the new row plus the new column, sharing one corner.
`],
  ['social', 'Social post · One good idea', 'An editorial card for a useful, shareable thought.',
`# Make room for one good idea

**Field notes · 01**

@ART@

You do not need a longer to-do list. You need a small space where a thought can become something you can try.

## A ten-minute reset

| Minute | Make space |
| :--- | :--- |
| 0–2 | Write the question |
| 2–7 | Sketch three ideas |
| 7–10 | Choose a small test |

> A good next step is small enough to start and real enough to teach you something.

**Try it today:** protect ten minutes before your next meeting.

*Made to be shared. What will you test?*
`],
  ['brief', 'Project brief · Shared ground', 'A compact agreement on the problem and next step.',
`# A better first week

**Project brief · Team onboarding · 6 March**

@ART@

New teammates should spend their first week meeting people and doing meaningful work. Today, too much of that week disappears into finding the right information.

**Our aim:** one clear starting place, with a human welcome.

## The agreement

| Milestone | When |
| :--- | :--- |
| Agree pilot | Friday |
| First trial | Next intake |
| Review | 20 March |

**For:** new teammates and team leads. **Deliver:** a short guide, a named buddy and a first-week plan.

**Success:** people find help without asking twice. **Outside scope:** replacing HR or account provisioning.

## Next three steps

1. **Listen** · Interview five recent starters. Owner: Jo.
2. **Make** · Draft the first-week guide. Owner: Ari.
3. **Try** · Test with the next intake. Owner: Team leads.

**Decision needed:** agree the pilot team by Friday. **Check-in:** 20 March · review what people actually used.

> Keep it useful, keep it short, and leave a clear way to ask for help.
`],
  ['recipe', 'Recipe card · A bright bowl', 'Ingredients and a calm, readable cooking sequence.',
`# Lemon, greens & white beans

**One pan · 20 minutes · Serves 2**

@ART@

A bright, comforting bowl for the end of a long day. Keep a little of the bean liquid: it makes the sauce silky without cream.

## Gather

| Ingredient | Amount |
| :--- | :--- |
| White beans | 400 g |
| Tender greens | 150 g |
| Garlic | 2 cloves |
| Lemon | 1 |
| Olive oil | 2 tbsp |
| Bread & seasoning | To taste |

## Make

1. Warm the oil in a wide pan. Soften the garlic for a minute.
2. Add the beans and a splash of their liquid. Simmer for 5 minutes.
3. Fold in the greens until just wilted. Add zest and a squeeze of lemon.
4. Taste, season and spoon into warm bowls. Serve with bread.

> **Make it yours:** add chilli flakes, chopped herbs or a spoonful of yoghurt.

Cool leftovers promptly, refrigerate and eat within two days. Reheat until piping hot.
`],
  ['poster', 'Event poster · After hours', 'A bold invitation with a readable programme.',
`# After hours

**An evening of small performances & big discoveries**

@ART@

One room. Four local acts. A chance to hear something new and meet the people making it.

## Friday 12 November

**6:30–9 pm · The Old Workshop** 28 Station Road · Free entry

| Time | On the floor |
| :--- | :--- |
| 6:30 | Doors & drinks |
| 7:00 | River Collective |
| 7:40 | Juniper |
| 8:20 | Open floor |

### Bring your curiosity

Seats are limited. Reserve a place at [events@example.com](mailto:events@example.com).

Step-free entrance. Quiet room available. Tell us what would help you enjoy the evening.

**Made here. Shared here. Everyone welcome.**
`],
];
const SCREEN = records.map(([key, name, description, body], index) => {
  const label = 'starter-' + key;
  const image = '![' + ({cv: 'A clear direction', menu: 'Tomato and basil', invitation: 'An envelope full of sunshine', lesson: 'A new perspective', social: 'Small steps forward', brief: 'A shared plan', recipe: 'A warm bowl of greens', poster: 'The evening is opening up'})[key] + '][' + label + '] <!--md-layout:v1 width=30% wrap=around x=100% y=0em-->';
  const source = '---\nmainfont: sans\nlinestretch: 1.55\n---\n\n' + body.replace('@ART@', image) + '\n[' + label + ']: data:image/svg+xml;base64,' + btoa(art[key]) + '\n';
  return Object.freeze({version: 1, id: 'p' + String(index + 1).padStart(24, '0'), name, description,
    content: Object.freeze({scope: 'document', text: source}),
    presentation: Object.freeze({settings: Object.freeze({mainfont: 'sans', linestretch: '1.55'}), fonts: ''})});
});
export const STARTERS = Object.freeze(SCREEN);
