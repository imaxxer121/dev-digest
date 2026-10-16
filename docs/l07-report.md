# L07 — Multi-Agent Review та Export to CI

Робота додає до DevDigest паралельне рев’ю одного PR кількома агентами та перенесення збереженого агента у GitHub Actions. Базові сценарії перевірено після спільного мержу; демонстрація використовує реальні відповіді моделей, артефакти Actions і записи локальної студії. Стан за збереженими доказами на 2026-10-16: виправлення #24 змержено звичайним захищеним gate, але #22 залишається відкритим через хибнопозитивний CRITICAL від моделі. Здача роботи та завантаження відео утримуються за вказівкою користувача.

Цей файл перенесено зі збереженого `work/dev-digest/docs/l07-report.md` та оновлено за локальними JSON/log captures. Історичні вимірювання нижче не є новими запусками. Посилання на локальні screenshots/evidence ведуть до збереженого сусіднього дерева `work/dev-digest`; їх перенесення сюди не означає нової публікації артефактів.

## Код і порядок інтеграції

| Етап | PR | Результат |
| --- | --- | --- |
| Спільні контракти, пакет із навчальної гілки, дві спеки | [#15](https://github.com/imaxxer121/dev-digest/pull/15) | Межі зафіксовано до реалізації |
| Worktree A: Multi-Agent Review | [#16](https://github.com/imaxxer121/dev-digest/pull/16) | Змержено після 6 зелених перевірок |
| Worktree B: Export to CI | [#17](https://github.com/imaxxer121/dev-digest/pull/17) | Оновлено від A; змержено після 6 зелених перевірок |
| Спільна композиція сервісів, навігація, верифікатор | [#18](https://github.com/imaxxer121/dev-digest/pull/18) | Змержено після 6 зелених перевірок |
| Встановлення із чотирикрокового wizard | [#19](https://github.com/imaxxer121/dev-digest/pull/19) | Manifest, workflow, skill, memory і автономний runner |
| Виправлення контексту внутрішнього PR у fork-репозиторії | [#21](https://github.com/imaxxer121/dev-digest/pull/21) | 35 тестів runner та перевірка автономного bundle |
| Обмежений бюджет inference для звичайних code diffs | [#23](https://github.com/imaxxer121/dev-digest/pull/23) | Змержено після обох зелених checks, включно з моделлю |
| Переводи рядків workflow та оригінальні знахідки у CI trace | [#22](https://github.com/imaxxer121/dev-digest/pull/22) | Відкритий, head `b82685756b52e583c4bf4b01abb15055ba74cbb5`; чотири hosted test workflows зелені, required model review червоний через хибний SQL-injection CRITICAL |
| Deadline локального CPU inference | [#24](https://github.com/imaxxer121/dev-digest/pull/24) | Обидва checks зелені; звичайний захищений merge `88ffdb274e49f0484c40c4befb580edca5949032`, protection не змінювався |

Спеки: [Multi-Agent Review](../specs/multi-agent-review.md), [Export to CI](../specs/export-to-ci.md). Узгодження власників файлів і порядку мержу: [план](l07-plan.md).

Два агенти реалізації працювали у власних native Git worktrees: `feat/l07-multi-agent-review` та `feat/l07-export-to-ci`. Третій агент перевіряв спеки й архітектурні межі. Спільна основа — commit `be1dcd5a5c1acbe8d7d96dc6135175284836aee7`. B спочатку реалізовано незалежно, потім оновлено від завершеного A. Єдиний конфлікт мержу — журнал Drizzle migrations: збережено обидва послідовні записи 0015 і 0016. Навігацію зібрано окремо під час композиції.

Claude Code та OpenRouter-ключ недоступні. Для делегованої реалізації використано субагентів Codex, для Studio — справжній Codex CLI через наявну підписку ChatGPT. CI має явно вибраний runtime `ollama / qwen2.5-coder:7b-instruct`: inference відбувається на CPU runner GitHub Actions. Облікові дані Codex не експортуються. API-ключ моделі для цього варіанта не потрібен.

## Що працює після спільного мержу

Multi-Agent Review зберігає батьківський запуск та незмінне членство 1–5 агентів. Diff готується один раз; контексти, помилки, результати й traces залишаються окремими. Columns показує статус кожного агента, Tabs + detail — деталі оригінальної знахідки. Групування не втрачає авторство. `Did not flag` доступне лише для завершеного успішного агента; `failed` не означає відсутності проблем.

Для оригінальних знахідок доступні Accept, Reject, Learn та Turn into eval case. Trace показує збережені конфігурацію, diff, prompt assembly, результат grounding, час і токени. Історія батьківського запуску не залежить від подальшого видалення профілю агента.

Export Wizard проходить Target → Preview → Configure → Install. У Preview відредаговано назву workflow та коментар; ці зміни пережили Configure. Обрано події `opened`, `synchronize`, `reopened`, спосіб публікації `pr_comment` і `Fail CI on: critical`. Install створив PR #19 у гілці `devdigest/ci`; ZIP містить ті самі сім файлів, включно з усіма runtime chunks runner. Manifest зберігає UUID агента, повний system prompt, skill і явний CI runtime. На момент експорту repository memory була порожньою; нове навчання виконано після контрольного порівняння.

Workflow бере runner і конфігурацію з trusted base, не виконує код PR, пропускає зовнішні PR, використовує `contents: read` і `pull-requests: write`. Actions закріплено повними SHA; завантаження офіційного Ollama перевіряється SHA-256. Diff і PR body передаються як недовірені дані. Перший installation PR мав окремий bootstrap-статус без inference та без review-артефакта.

## Контрольне порівняння одного й трьох агентів

В обох прогонах використано [PR #5](https://github.com/imaxxer121/dev-digest/pull/5), head `224e621221872a01be3c493d564f50959c740356`: 11 файлів, 110 доданих рядків. SHA-256 серіалізованих diff files: `029e6ec3c10cb8c96dfe2bab9fb2fc69857b531b6d8ead9f0d59f10d52f4bff7`.

Security profile v1, його prompt assembly, конфігурація та source diff буквально однакові між успішним одиночним і потрійним прогонами. У всіх трьох профілях `single-pass`, `codex/gpt-6.1-sol`, repo intel вимкнено; до порівняння не змінювались skills і memory.

| Прогін / агент | Статус | Час inference, с | Input | Output | Оригінальних знахідок |
| --- | --- | ---: | ---: | ---: | ---: |
| Один: Security | done | 78.170 | 14 139 | 2 475 | 13 |
| Три: Security | done | 75.384 | 14 137 | 2 563 | 13 |
| Три: Stack | done | 71.734 | 14 214 | 2 119 | 10 |
| Три: Conventions | done | 9.946 | 14 145 | 132 | 0 |
| Три разом | 3 done | максимум 75.384 | 42 496 | 4 814 | 23 |

Сума часу inference трьох агентів — 157.064 с; вони виконувались паралельно. Спільне завантаження diff тривало 0.868 с. Input виріс у 3.006 раза, output — у 1.945 раза. Це один контрольний дослід, тому він не доводить універсального прискорення чи зростання якості. Вартість у USD невідома: subscription-backed CLI не повернув ціни.

23 первинні знахідки згруповано у 20 евристичних груп. Схожість не гарантує повного семантичного дедуплікування: близькі за змістом заголовки можуть залишатись окремими. `Did not flag` у блоці розбіжностей стосується конкретної групи. Security grounding — 13/13; атрибуція та первинні тексти збережені.

Перший одиночний запуск завершився timeout після 300.020 с. Його облік токенів неповний, фактичне споживання невідоме. Він залишений в історії; таблиця порівнює наступний успішний запуск із потрійним. Окремий короткий Codex probe перевіряв доступність runtime і не зарахований як рев’ю.

## Ізоляція відмов, навчання та eval

У додатковому запуску Security завершився за 88.229 с з 15 знахідками, Conventions — за 9.674 с без знахідок, General Reviewer отримав `OPENROUTER_API_KEY is not configured` за 1 мс до виклику моделі. Два успішні результати збережено. Негативний висновок за General не підставляється.

SQL-знахідку `Email input changes SQL syntax`, `security-demo/db.ts:8–9`, прийнято. Створено frozen eval case `9d25b96c-16c6-4c79-b692-fb0dc5ef4c5c` із trace source diff. Learn створив memory `16dd60ee-4f22-4fbe-84f3-27edc92724f4`; повторний Learn повернув той самий ID, у БД один запис. Дубль upload path traversal від Stack відхилено; оригінал Security зберігся.

Справжній replay збереженого SQL eval завершено: batch `a9e50e58-a7a1-48a3-9c23-e9bd44ad37a9`, 21.264 с, 1/1 cases passed. Recall 100%, citation accuracy 100%, precision 50%: модель повернула дві grounded знахідки, а curated rubric містить одну очікувану позитивну позицію. Це позиційна оцінка одного кейсу, тому вона не є оцінкою семантичної точності всього агента.

## Реальний CI: блокування та виправлення

[Demo PR #20](https://github.com/imaxxer121/dev-digest/pull/20) містить ізольований приклад `request.query.name` → SQL. Код цього каталогу не імпортується застосунком. Дві реальні версії пройшли той самий збережений CI manifest, skill і trusted base `e5d41ae095a73adba204f7a1f28beec82cf42649`.

| Версія | Actions | Head | Inference, с | Input / output | Grounding | Verdict / check |
| --- | --- | --- | ---: | --- | --- | --- |
| Конкатенація input із SQL | [38393555594](https://github.com/imaxxer121/dev-digest/actions/runs/38393555594) | `c70aee91` | 148.917 | 1005 / 358 | 1/1 | `request_changes`, failure |
| `$1` і окремий масив значень | [38395418066](https://github.com/imaxxer121/dev-digest/actions/runs/38395418066) | `ad641f8d` | 138.336 | 1008 / 80 | 0/0 | `approve`, success |

Перший результат містить справжню CRITICAL `SQL Injection Vulnerability`, `demo/l07-ci-gate/lookup.ts:8`. Детермінований gate повернув один blocker і ненульовий exit code. `DevDigest review` є required check для `feat/l07-integration`, включно з адміністраторами: [кнопка Merge недоступна](assets/l07-ci-red-blocked.png). Після прив’язки параметра модель повернула нуль знахідок, check зелений, [кнопка Merge доступна](assets/l07-ci-green-merge-enabled.png). Demo PR залишено відкритим як доказ зміни результату.

Обидва артефакти отримано з GitHub authenticated REST та перевірено за repository ID `1415759003`, run ID/attempt, PR/head, workflow, manifest і trusted-base files. Це не завантаження довільного JSON від клієнта. Результати записані у `agent_runs.source='ci'`, статус `done`; trace і CI verdict зберігаються окремо від успішності виконання runner. Повторний import першого артефакта повернув «already in history» без дубля.

Studio IDs: червоний `6b2b4038-962f-4c9e-a295-5436a7511f4c`, зелений `01e5b9a4-32d8-4806-b589-69e37798175b`. [Історія обох версій](assets/l07-ci-red-green-history.png), [оригінальна знахідка у trace](assets/l07-ci-red-trace.png). Точні [raw red](evidence/l07/ci-red-result.json), [raw green](evidence/l07/ci-green-result.json) та [DB source records](evidence/l07/ci-agent-run-records.json) збережено для перевірки.

Обмеження моделі: Qwen правильно описав SQL injection, але поставив додатковий `kind=secret_leak` і повторив evidence components. Ці поля не виправлялись заднім числом. Grounding перевіряє позиційні посилання, а не семантику класифікації; тому цей дослід підтверджує CI gate та provenance, не безпомилковість рев’юера. Runtime Studio і CI явно відрізняється; це не порівняння якості двох моделей.

## Фінальний стан CI та відкритого #22

Для #24 збережений `work/l07-repair-24-merge.json` фіксує head `8b5215bcfa0bde4e6cba1ffd814d367dd96945fa`, успішні [DevDigest review](https://github.com/imaxxer121/dev-digest/actions/runs/38400101770) і [runner contract and bundle](https://github.com/imaxxer121/dev-digest/actions/runs/38400101744), merge `88ffdb274e49f0484c40c4befb580edca5949032` та `protection_unchanged=true`. Це завершений звичайний merge, не продовження попереднього тимчасового винятку #21.

Для #22 на head `b82685756b52e583c4bf4b01abb15055ba74cbb5` збережений snapshot `work/l07-final-checks-20261016.json` показує чотири зелені hosted workflows: [tests](https://github.com/imaxxer121/dev-digest/actions/runs/38905537843), [tests + typecheck](https://github.com/imaxxer121/dev-digest/actions/runs/38905537788), [PostgreSQL](https://github.com/imaxxer121/dev-digest/actions/runs/38905537280), [browser flows](https://github.com/imaxxer121/dev-digest/actions/runs/38905537191). Це п’ять зелених jobs; у цьому ранньому snapshot model review ще був `in_progress`.

Пізніший [DevDigest review 38905537181](https://github.com/imaxxer121/dev-digest/actions/runs/38905537181) дійсно виконав `ollama / qwen2.5-coder:7b-instruct` і завершився червоним. `work/l07-final-review-failed.log` фіксує о 13:16:46 UTC `findings=1 blockers=1 gateTriggered=true` та exit code 1. Публічний [коментар 6216337770](https://github.com/imaxxer121/dev-digest/pull/22#issuecomment-6216337770) назвав `runId` і `findings` у JSX джерелом SQL injection та запропонував parameterized queries. У цьому UI-компоненті SQL-запиту немає. Більше того, вказані моделлю [рядки 28–30 точного head](https://github.com/imaxxer121/dev-digest/blob/b82685756b52e583c4bf4b01abb15055ba74cbb5/client/src/app/repos/%5BrepoId%5D/pulls/%5Bnumber%5D/_components/RunTraceDrawer/RunTraceDrawer.tsx#L19-L30) завершують props interface (`onClose`), а не будують SQL. Це хибнопозитивний семантичний висновок, не timeout і не доказ SQL-дефекту.

#22 залишається відкритим; його red check не обходили. Червоний результат збережено як фактичну поведінку required gate. Успіх справжньої SQL-демонстрації #20 вище та ця помилка на benign React-коді — різні спостереження. Вони не дозволяють назвати модель безпомилковою або вважати #22 змерженим.

## Перевірки та обмеження вимірювань

Повний локальний верифікатор після композиції пройшов 569 тестів: 256 server unit, 122 PostgreSQL integration без skips, 136 client, 23 reviewer-core, 32 runner. Пройшли TypeScript усіх чотирьох пакетів, сім дзеркал shared contracts, автономний ncc bundle smoke та production Next build. PostgreSQL tests використовують окремі Testcontainers і не ділять живу базу Studio. Evals L06 входять до обов’язкового integration suite.

Після цього браузерна перевірка виявила пропущений `ci` у whitelist вкладок агента: виправлено й додано регресійний тест. Виправлення fork context додало три регресійні кейси: runner suite — 35/35 у шести файлах. Для LF/CRLF та оригінальних CI finding snapshots додано ще два регресійні тести. Пройшли 39 focused server CI/container/adapter/bootstrap tests, 74 CI/PR component tests, server/client TypeScript і production Next build. Базовий повний запуск 569 та наступні focused перевірки наведено окремо; автоматизовані unit/integration tests використовують fixtures, живі model reviews — таблиці вище.

Перший CI до inference відхилив внутрішній PR, бо GitHub `repo.fork` описує походження репозиторію. PR #21 порівнює head/base repository IDs, зберігаючи окрему REST-перевірку origin. Оскільки старий trusted-base runner блокував власне виправлення, після явної згоди власника тимчасово дозволено administrator bypass лише для злиття #21. Обов’язковий `DevDigest review` не видалявся; `enforce_admins=true` відновлено через 3.352 с. Повторний event старого demo head ще містив попередній base SHA; після оновлення demo від нової бази він використовує виправлений runner. Ці інфраструктурні помилки не зараховані як виявлення SQL.

Ретроспективи розділено за запусками: [історична L07 parallel-features](retros/l07-parallel-features.md) та [поточний course-labs checkpoint](retros/course-labs-completion.md), [поточний ledger](retros/ledger.md). Числа з історичного L07 coding run не переносяться на нових collaboration workers: їхні model identity, counters і повні totals не спостерігаються. Сирі журнали приватних чатів і облікові дані не публікуються; у збереженому [evidence](evidence/l07/) є метрики, ID, digest та перевірені результати попереднього завдання.

Демо-відео `outputs/l07-multi-agent-ci-demo.mp4` підготовлено окремо і поки не подано та не завантажено. Збережені metadata вказують 312.67 с, 5 990 697 bytes і `full_decode_passed=true`. Це монтаж реальних кадрів браузера зі скороченим очікуванням моделей і синтетичною озвучкою; без підміни результатів або заяви про безперервний запис. Нові T8 browser/model докази для course-labs ще збираються і не оголошуються завершеними цим L07 звітом.
