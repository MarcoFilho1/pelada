---
version: 1
slug: "src-app-entrar-page-tsx"
primary_target: "src/app/entrar/page.tsx"
related_targets: ["src/app/trocar-pin/page.tsx","src/app/admin/entrar/page.tsx"]
---

# Entrada (jogador e admin)

Scope: /entrar, /trocar-pin, /admin/entrar. Mode: Operate. First UI of the app; sets the world for every later screen.

Audience and job: one of ~25 friends, on a phone, often at night at the court, coming from a WhatsApp link. Job: say who you are and type a 4-digit PIN, in seconds, one hand. First access forces a new PIN. Admin: usuario + senha.

States: typing name (suggestions, none found), PIN typing, checking, PIN errado, bloqueado (15 min), new PIN = 1234 refused, confirmation mismatch, admin wrong credentials.

Run notes: unattended subagent run. Decision page not served (nobody to answer); assigned direction built as the roll dictates. Verdicts: metro tiles declined (kept: type is the interface, names are the doors); vertical feed declined (kept: one task owns the screen at a time); acetate manual declined (kept: fixed state vocabulary); Saville sleeve declined (kept: unprinted black); timetable rack declined (kept: few sizes do the work); split-flap concourse declined (kept: characters in fixed cells, a two-frame step on change).

## Direction contract

THESIS: the várzea scoreboard, plates hung by hand, white numerals painted on black metal. Refuses the category default of a centred card with email/password fields on a grey page.
OWN-WORLD: true black ground, plates one lightness step up (#111, pressed #2a2a2a), painted white numerals in a condensed sign-painter face, Inter for words. Lime only on state (a plate just hung, a confirmed thing); red only on error. Primary action is an inverted white pill. No borders on surfaces, no shadows.
STORY: the visitor sees "Quem é você?", types two letters, taps their own name, and hangs four PIN plates; the fourth plate signs them in with no button.
FIRST VIEWPORT: wordmark top-left and an "Admin" text link top-right on the ground; h1 "Quem é você?" in the top third; 56px name field under it, focused; suggestion rows (56px, name at 18px) fill the space below, inside thumb reach. PIN step: chosen name as h1, four 72px plates centred, hint "Primeiro acesso? Seu PIN é 1234." under them; after an error, "Esqueceu o PIN? Peça ao admin para zerar."
FORM: candidate 3 of 7 (hand-hung várzea scoreboard plates). seed:0a4598877a56d851
Raises: split-flap (each digit lands in a fixed cell with a 2-frame 90ms step); vertical feed (one step owns the screen: name, then PIN); acetate (state vocabulary: empty plate = dash, hung plate = its numeral painted for 0.7s then a white dot, wrong = red plates then cleared, saving the new PIN = lime dots).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
