package com.michaelyeh.mybudgetplanner

import android.os.SystemClock
import android.os.LocaleList
import android.content.res.Configuration
import android.view.View
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Test
import org.junit.Before
import org.junit.Assume.assumeTrue
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BudgetAppTest {
    @Test fun currencySymbolFollowsAndroidLocaleWithoutChangingBudget() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(currentState)")
            var original: Configuration? = null
            scenario.onActivity { activity -> original = Configuration(activity.resources.configuration) }
            val before = evaluate(scenario, "JSON.stringify(currentState)")
            try {
                for ((locale, currency, symbol) in listOf(
                    Triple("en-US", "USD", "$"),
                    Triple("en-GB", "GBP", "\u00a3"),
                    Triple("de-DE", "EUR", "\u20ac")
                )) {
                    scenario.onActivity { activity ->
                        val configuration = Configuration(activity.resources.configuration)
                        configuration.setLocales(LocaleList.forLanguageTags(locale))
                        @Suppress("DEPRECATION")
                        activity.resources.updateConfiguration(configuration, activity.resources.displayMetrics)
                    }
                    evaluate(scenario, "window.localeDisplayDone = false; budgetPlatform.displayCurrency().then(display => { window.localeDisplay = display; budget.setCurrencyDisplay(display.locale, display.currency); render(currentState); window.localeDisplayDone = true; });")
                    waitFor(scenario, "window.localeDisplayDone === true")
                    assertEquals(currency, evaluate(scenario, "window.localeDisplay.currency"))
                    assertEquals("${symbol}1,234.50", evaluate(scenario, "budget.formatMoney(1234.5)"))
                    assertEquals(before, evaluate(scenario, "JSON.stringify(currentState)"))
                }
            } finally {
                scenario.onActivity { activity ->
                    @Suppress("DEPRECATION")
                    activity.resources.updateConfiguration(original!!, activity.resources.displayMetrics)
                }
            }
        }
    }

    @Before fun supportedWebView() {
        assumeTrue("Update the emulator WebView to version 100+ before running budget interaction tests", MainActivity.supportsWebView())
    }
    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWeb(view.getChildAt(index))?.let { return it }
        return null
    }

    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): Any? {
        val done = CountDownLatch(1)
        var result: Any? = null
        scenario.onActivity { activity ->
            val web = findWeb(activity.window.decorView) ?: error("WebView unavailable")
            web.evaluateJavascript(script) { value ->
                result = JSONTokener(value).nextValue()
                done.countDown()
            }
        }
        assertTrue("JavaScript evaluation timed out", done.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitFor(scenario: ActivityScenario<MainActivity>, expression: String) {
        val deadline = SystemClock.uptimeMillis() + 15000
        while (SystemClock.uptimeMillis() < deadline) {
            if (evaluate(scenario, expression) == true) return
            SystemClock.sleep(100)
        }
        val diagnostic = evaluate(scenario, "JSON.stringify({url:location.href,body:document.body?.innerText,bridge:typeof window.AndroidBudget,platform:typeof window.budgetPlatform,engine:typeof window.budget,state:typeof currentState})")
        fail("Condition timed out: $expression; $diagnostic")
    }

    private fun assertGroupItemControls(scenario: ActivityScenario<MainActivity>) {
        assertEquals(0, evaluate(scenario, "document.querySelectorAll('[data-add-subgroup]').length"))
        assertEquals(true, evaluate(scenario, "(() => { const groups = [...document.querySelectorAll('.item-group')]; return groups.length > 0 && groups.every(group => Boolean(group.querySelector(':scope > [data-add-group-item]'))); })()"))
        assertEquals(0, evaluate(scenario, "document.querySelectorAll('.expense-item .tag').length"))
        assertEquals(true, evaluate(scenario, "!document.documentElement.classList.contains('android-app') || [...document.querySelectorAll('.item-group-header')].every(header => { const row = header.querySelector('.group-name-row'); return row && getComputedStyle(row.querySelector('h4')).display === 'inline' && getComputedStyle(row.querySelector('.group-total')).display === 'inline'; })"))
        assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('.expense-item')].every(item => { const row = item.querySelector('.item-name-row'); return row && getComputedStyle(row.querySelector('strong')).display === 'inline' && getComputedStyle(row.querySelector('.small')).display === 'inline'; })"))
    }

    private fun assertEntryMenu(scenario: ActivityScenario<MainActivity>, selector: String, expected: String) {
        evaluate(scenario, "document.querySelector(\"$selector .entry-menu-toggle\").click();")
        assertEquals(expected, evaluate(scenario, "[...document.querySelectorAll('.entry-action-menu button')].map(button => button.textContent).join(',')"))
        assertEquals(true, evaluate(scenario, "(() => { const options = document.querySelectorAll('.entry-action-menu button'); return options[1].getBoundingClientRect().top - options[0].getBoundingClientRect().bottom >= 4; })()"))
        assertEquals(true, evaluate(scenario, "document.querySelector(\"$selector .entry-menu-toggle\").getAttribute('aria-expanded') === 'true'"))
        evaluate(scenario, "document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));")
        assertEquals(expected.split(',')[1], evaluate(scenario, "document.activeElement.textContent"))
        evaluate(scenario, "document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));")
        assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('.entry-action-menu'))"))
        assertEquals(true, evaluate(scenario, "document.activeElement.matches('.entry-menu-toggle')"))
    }

    private fun assertCategoryColor(scenario: ActivityScenario<MainActivity>) {
        evaluate(scenario, """
            document.querySelector('[data-category-id=default-needs] .entry-menu-toggle').click();
            [...document.querySelectorAll('.entry-action-menu button')].find(button => button.textContent === 'Color').click();
            window.colorEditor = document.querySelector('.category-color-dialog');
            window.colorColumn = document.querySelector('[data-category-id=default-needs]');
            colorEditor.querySelector('[name=hex]').value = '#abcdef';
            colorEditor.querySelector('form').requestSubmit();
        """.trimIndent())
        assertEquals("#abcdef", evaluate(scenario, "currentState.categories.find(category => category.id === 'default-needs').color"))
        assertEquals(true, evaluate(scenario, "colorColumn === document.querySelector('[data-category-id=default-needs]') && colorColumn.style.getPropertyValue('--accent') === '#abcdef' && getComputedStyle(colorColumn).color === 'rgb(255, 255, 255)' && !document.querySelector('.category-color-dialog')"))
        evaluate(scenario, """
            document.querySelector('[data-category-id=default-needs] .entry-menu-toggle').click();
            [...document.querySelectorAll('.entry-action-menu button')].find(button => button.textContent === 'Color').click();
            document.querySelector('.category-color-dialog [name=hex]').value = '#000000';
            document.querySelector('.category-color-dialog button.secondary').click();
        """.trimIndent())
        assertEquals("#abcdef", evaluate(scenario, "currentState.categories.find(category => category.id === 'default-needs').color"))
    }

    private fun assertSummarySelector(scenario: ActivityScenario<MainActivity>) {
        assertEquals(true, evaluate(scenario, "(() => { const mobile = document.documentElement.classList.contains('android-app') || innerWidth <= 720; if (!mobile) return true; const heading = document.querySelector('.summary-heading'); const title = heading.querySelector('h2').getBoundingClientRect(); const select = heading.querySelector('select').getBoundingClientRect(); const label = heading.querySelector('.summary-period-control > span'); const meta = document.querySelector('.category-form-meta').getBoundingClientRect(); const period = document.querySelector('.board-period-control').getBoundingClientRect(); return getComputedStyle(label).display === 'none' && select.top <= title.bottom && select.bottom >= title.top && select.left >= title.right && heading.querySelector('select').getAttribute('aria-label') === 'Complete Summary Period' && Math.abs(period.right - meta.right) <= 1; })()"))
        val categoryControlsValid = evaluate(scenario, "(() => { const mobile = document.documentElement.classList.contains('android-app') || innerWidth <= 720; const category = document.querySelector('.category-column'); const toggle = category.querySelector('[data-toggle-category]'); if (!mobile && currentState.app.categoriesPerRow !== 1) return getComputedStyle(toggle).display === 'none'; const list = category.querySelector('.expense-list'); const original = currentState.app.collapsedCategories[category.dataset.categoryId] === true; const groups = JSON.stringify(currentState.app.collapsedGroups); if (original) toggle.click(); toggle.click(); const collapsed = getComputedStyle(list).display === 'none' && toggle.getAttribute('aria-expanded') === 'false' && currentState.app.collapsedCategories[category.dataset.categoryId] === true && category.querySelector('.column-metrics').getBoundingClientRect().height > 0 && category.querySelector('.progress-bar').getBoundingClientRect().height > 0; toggle.click(); const expanded = getComputedStyle(list).display !== 'none' && toggle.getAttribute('aria-expanded') === 'true' && category.querySelector('.expense-list') === list && JSON.stringify(currentState.app.collapsedGroups) === groups; if (original) toggle.click(); const label = document.querySelector('.board-period-control'); const range = document.createRange(); range.selectNodeContents(label.firstChild); const textRect = range.getBoundingClientRect(); const select = label.querySelector('select').getBoundingClientRect(); window.categoryControlsDebug = {collapsed, expanded, mobile, select: select.toJSON(), text: textRect.toJSON()}; return collapsed && expanded && (!mobile || (select.left - textRect.right <= 10 && select.left >= textRect.right)); })()")
        assertEquals(evaluate(scenario, "JSON.stringify(window.categoryControlsDebug)").toString(), true, categoryControlsValid)
        assertEquals(true, evaluate(scenario, "(() => { if (!document.documentElement.classList.contains('android-app') && innerWidth > 720) return true; const heading = document.querySelector('.budget-board-heading'); const warning = document.createElement('span'); warning.className = 'message'; warning.textContent = 'Warning: category targets exceed 100% by 25.0%.'; heading.querySelector('.budget-board-title').append(warning); const title = heading.querySelector('h2').getBoundingClientRect(); const toggle = heading.querySelector('.hint').getBoundingClientRect(); const warningRect = warning.getBoundingClientRect(); const meta = document.querySelector('.category-form-meta'); const totals = [...meta.querySelectorAll(':scope > span')].map(node => node.getBoundingClientRect()); const period = meta.querySelector('.board-period-control').getBoundingClientRect(); const valid = toggle.top <= title.bottom && toggle.bottom >= title.top && warningRect.top >= Math.max(title.bottom, toggle.bottom) && totals.length === 1 && !meta.textContent.includes('Categorized:') && period.top <= totals[0].bottom && period.bottom >= totals[0].top && period.left >= totals[0].right; warning.remove(); return valid; })()"))
        assertEquals(0, evaluate(scenario, "document.querySelectorAll('[data-toggle-summary]').length"))
        assertEquals(true, evaluate(scenario, "(() => { const card = document.querySelector('.notes-card'); const heading = card.querySelector('h2').getBoundingClientRect(); const toggle = card.querySelector('[data-toggle-notes]'); const rect = toggle.getBoundingClientRect(); const editor = card.querySelector('textarea'); const original = editor.value; editor.value = '<b>Plain note</b>\\nSecond line'; editor.dispatchEvent(new Event('input',{bubbles:true})); toggle.click(); const preview = card.querySelector('.notes-preview'); const collapsed = editor.hidden && !preview.hidden && preview.textContent === editor.value && preview.children.length === 0 && getComputedStyle(preview).borderTopWidth === '0px' && currentState.app.isNotesOpen === false; toggle.click(); const expanded = !editor.hidden && preview.hidden && card.querySelector('textarea') === editor && editor.value === '<b>Plain note</b>\\nSecond line'; editor.value = original; editor.dispatchEvent(new Event('input',{bubbles:true})); return collapsed && expanded && rect.left >= heading.right && Math.abs(rect.right - card.querySelector('.section-heading').getBoundingClientRect().right) <= 1 && rect.top <= heading.bottom && !card.textContent.includes('Personal notes are saved'); })()"))
        evaluate(scenario, "window.originalFaqOpen = document.querySelector('.faq-card > details').open; document.querySelector('.faq-card > details').open = !window.originalFaqOpen;")
        waitFor(scenario, "currentState.app.isFaqOpen === !window.originalFaqOpen")
        evaluate(scenario, "document.querySelector('.faq-card > details').open = window.originalFaqOpen;")
        waitFor(scenario, "currentState.app.isFaqOpen === window.originalFaqOpen")
        assertEquals(true, evaluate(scenario, "(() => { const card = document.querySelector('.summary-card:not([hidden])'); const boxes = [...card.querySelectorAll('.summary-row')]; const mobile = document.documentElement.classList.contains('android-app') || innerWidth <= 720; return boxes.length === 5 && (mobile ? boxes[1].getBoundingClientRect().top > boxes[0].getBoundingClientRect().top && boxes.every(box => getComputedStyle(box).flexDirection === 'row' && getComputedStyle(box).borderRadius === '0px') : boxes[1].getBoundingClientRect().top === boxes[0].getBoundingClientRect().top && boxes.every(box => getComputedStyle(box).flexDirection === 'column')); })()"))
        assertEquals(true, evaluate(scenario, "(() => { const selector = document.querySelector('[data-board-period-select]'); const original = selector.value; const summaryPeriod = currentState.app.summaryPeriod; const column = document.querySelector('[data-category-id]'); const valid = budget.SUMMARY_PERIODS.every(([period,label]) => { selector.value = period; selector.dispatchEvent(new Event('change',{bubbles:true})); const summary = budget.getBudgetSummary(currentState).categories.find(category => category.id === column.dataset.categoryId); const metrics = budget.getCategoryPeriodMetrics(summary, period); return column === document.querySelector('[data-category-id]') && column.querySelector('[data-target-label]').textContent === 'Budget' && column.querySelector('[data-category-target]').textContent === budget.formatMoney(metrics.target) && column.querySelector('[data-category-spent]').textContent === budget.formatMoney(metrics.spent) && column.querySelector('[data-category-remaining]').textContent === budget.formatMoney(metrics.remaining) && currentState.app.summaryPeriod === summaryPeriod && [...document.querySelectorAll('.group-total[data-monthly-total]')].every(total => total.textContent === budget.formatGroupTotal(Number(total.dataset.monthlyTotal), period)); }); selector.value = original; selector.dispatchEvent(new Event('change',{bubbles:true})); return valid; })()"))
        assertEquals(true, evaluate(scenario, "(() => { const grid = document.querySelector('.summary-grid-wide').getBoundingClientRect(); const section = document.querySelector('.summary-grid-wide').parentElement.getBoundingClientRect(); return Math.abs((grid.left - section.left) - (section.right - grid.right)) <= 2; })()"))
        assertEquals(true, evaluate(scenario, "(() => { const notes = document.querySelector('.notes-textarea'); const original = notes.value; notes.value = ''; notes.dispatchEvent(new Event('input',{bubbles:true})); const small = notes.getBoundingClientRect().height; notes.value = Array(40).fill('Long notes with enough text to wrap on a phone screen.').join('\\n'); notes.dispatchEvent(new Event('input',{bubbles:true})); const large = notes.getBoundingClientRect().height; const fits = notes.scrollHeight <= notes.clientHeight + 1; notes.value = ''; notes.dispatchEvent(new Event('input',{bubbles:true})); const shrank = Math.abs(notes.getBoundingClientRect().height - small) <= 1; notes.value = original; notes.dispatchEvent(new Event('input',{bubbles:true})); return small <= 80 && large > small * 4 && fits && shrank; })()"))
        assertEquals(true, evaluate(scenario, "(() => { const selector = document.querySelector('[data-summary-period-select]'); const original = selector.value; const column = document.querySelector('[data-category-id]'); const valid = ['weekly','biweekly','semi-monthly','monthly','quarterly','annual'].every(period => { selector.value = period; selector.dispatchEvent(new Event('change',{bubbles:true})); const visible = document.querySelectorAll('.summary-card:not([hidden])'); return visible.length === 1 && visible[0].dataset.summaryPeriod === period && currentState.app.summaryPeriod === period && column === document.querySelector('[data-category-id]'); }); selector.value = original; selector.dispatchEvent(new Event('change',{bubbles:true})); return valid; })()"))
    }

    // Inject real touchscreen events: synthetic DOM events do not exercise WebView scrolling.
    private fun drag(scenario: ActivityScenario<MainActivity>, source: String, target: String, fraction: Double, edgeScroll: Boolean = false, cancel: Boolean = false, scrollOnly: Boolean = false) {
        fun point(selector: String, y: Double): Pair<Float, Float> {
            evaluate(scenario, "(() => { const r = document.querySelector(\"$selector\").getBoundingClientRect(); scrollBy(0, r.top + r.height*$y - innerHeight/2); })();")
            SystemClock.sleep(150)
            val rect = org.json.JSONArray(evaluate(scenario, "JSON.stringify((() => { const r = document.querySelector(\"$selector\").getBoundingClientRect(); return [r.left + Math.min(12, r.width/2), r.top + r.height*$y, innerWidth]; })())").toString())
            var result = Pair(0f, 0f)
            scenario.onActivity { activity ->
                val web = findWeb(activity.window.decorView)!!
                val location = IntArray(2)
                web.getLocationOnScreen(location)
                val scale = web.width / rect.getDouble(2)
                result = Pair((location[0] + rect.getDouble(0) * scale).toFloat(), (location[1] + rect.getDouble(1) * scale).toFloat())
            }
            return result
        }
        val start = point(source, 0.5)
        val down = SystemClock.uptimeMillis()
        fun send(action: Int, p: Pair<Float, Float>) {
            val event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, p.first, p.second, 0)
            event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
            assertTrue(InstrumentationRegistry.getInstrumentation().uiAutomation.injectInputEvent(event, true))
            event.recycle()
        }
        var released = false
        try {
            val beforeScroll = (evaluate(scenario, "scrollY") as Number).toDouble()
            send(MotionEvent.ACTION_DOWN, start)
            if (scrollOnly) {
                send(MotionEvent.ACTION_MOVE, Pair(start.first, start.second - 60))
                SystemClock.sleep(60)
                val end = Pair(start.first, start.second - 180)
                send(MotionEvent.ACTION_MOVE, end)
                send(MotionEvent.ACTION_UP, end)
                released = true
                SystemClock.sleep(150)
                assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('.touch-dragging'))"))
                assertTrue("An ordinary swipe still scrolls", (evaluate(scenario, "scrollY") as Number).toDouble() > beforeScroll)
                return
            }
            SystemClock.sleep(500)
            assertEquals("Long press starts dragging", true, evaluate(scenario, "Boolean(document.querySelector('.touch-dragging'))"))
            if (edgeScroll) {
                val before = (evaluate(scenario, "scrollY") as Number).toDouble()
                var edge = start
                scenario.onActivity { activity ->
                    val web = findWeb(activity.window.decorView)!!
                    val location = IntArray(2)
                    web.getLocationOnScreen(location)
                    edge = Pair(start.first, (location[1] + web.height - 20).toFloat())
                }
                send(MotionEvent.ACTION_MOVE, edge)
                SystemClock.sleep(250)
                assertTrue("Dragging near an edge scrolls", (evaluate(scenario, "scrollY") as Number).toDouble() > before)
                send(MotionEvent.ACTION_MOVE, start)
                SystemClock.sleep(50)
            }
            assertEquals("A compact ghost identifies the held entry", true, evaluate(scenario, "(() => { const preview = document.querySelector('.touch-drag-preview'); return Boolean(preview?.textContent.trim()) && preview.getAttribute('aria-hidden') === 'true' && getComputedStyle(preview).pointerEvents === 'none' && !preview.querySelector('button, [data-expense-id], [data-group-name], [data-category-id]'); })()"))
            val end = point(target, fraction)
            send(MotionEvent.ACTION_MOVE, end)
            SystemClock.sleep(80)
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .executeShellCommand("screencap -p /data/local/tmp/mybudgeter-drag-preview.png").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            val valid = evaluate(scenario, "Boolean(document.querySelector('.touch-drop'))")
            if (valid != true) {
                send(MotionEvent.ACTION_CANCEL, end)
                released = true
            }
            assertEquals("A valid drop is highlighted", true, valid)
            send(if (cancel) MotionEvent.ACTION_CANCEL else MotionEvent.ACTION_UP, end)
            released = true
            SystemClock.sleep(150)
            assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('.touch-dragging, .touch-drop, .touch-drag-preview'))"))
        } finally {
            if (!released) {
                val cancelEvent = MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_CANCEL, start.first, start.second, 0)
                cancelEvent.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
                InstrumentationRegistry.getInstrumentation().uiAutomation.injectInputEvent(cancelEvent, true)
                cancelEvent.recycle()
            }
        }
    }

    @Test fun offlineBudgetSurvivesEditingMovementRecoveryAndUpgradeStyleRelaunch() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        File(context.filesDir, "budget.json").delete()
        File(context.filesDir, "session.json").delete()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            assertEquals("1.6.0", evaluate(scenario, "budget.APP_VERSION"))
            assertEquals(false, evaluate(scenario, "currentState.app.isIncomeOpen"))
            assertEquals(true, evaluate(scenario, "document.querySelector('[data-add-income]').closest('.collapsible-body').hidden"))
            evaluate(scenario, "document.querySelector('[data-toggle-income]').click();")
            assertEquals(0, evaluate(scenario, "document.querySelectorAll('[data-order-step]').length"))
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('[data-remove-category]')].every(button => button.textContent.charCodeAt(0) === 215 && button.hasAttribute('aria-label'))"))
            assertEquals("My Budget Planner", context.applicationInfo.loadLabel(context.packageManager).toString())
            assertEquals("My Budget Planner", evaluate(scenario, "document.title"))
            assertEquals("My Budget Planner", evaluate(scenario, "document.querySelector('.app-header h1').firstChild.textContent.trim()"))
            assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('.site-header'))"))
            assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('[draggable]'))"))
            assertEquals(1, evaluate(scenario, "document.querySelectorAll('.summary-card:not([hidden])').length"))
            assertSummarySelector(scenario)
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('.category-stats')].every(stats => stats.querySelector('.progress-bar').getBoundingClientRect().height === 8 && stats.querySelector('.progress-label').getBoundingClientRect().left >= stats.querySelector('.progress-bar').getBoundingClientRect().right)"))
            assertEquals(true, evaluate(scenario, "document.documentElement.scrollWidth <= window.innerWidth"))
            scenario.onActivity { activity ->
                val web = findWeb(activity.window.decorView)!!
                val position = IntArray(2)
                web.getLocationOnScreen(position)
                val bars = androidx.core.view.ViewCompat.getRootWindowInsets(web)!!
                    .getInsets(androidx.core.view.WindowInsetsCompat.Type.statusBars())
                assertTrue("Content overlaps the status bar", position[1] >= bars.top)
            }
            for (width in listOf(320, 360, 390, 430)) {
                scenario.onActivity { activity ->
                    val web = findWeb(activity.window.decorView)!!
                    web.layoutParams = web.layoutParams.apply { this.width = (width * activity.resources.displayMetrics.density).toInt() }
                    web.requestLayout()
                }
                SystemClock.sleep(150)
                assertEquals("Horizontal overflow at $width", true, evaluate(scenario, "document.documentElement.scrollWidth <= window.innerWidth"))
                assertEquals("No ordering bars at $width", 0, evaluate(scenario, "document.querySelectorAll('[data-order-step]').length"))
                assertEquals("Inline category controls at $width", true, evaluate(scenario, "[...document.querySelectorAll('.column-header')].every(header => { const name = header.querySelector('h3').parentElement.getBoundingClientRect(); const actions = header.querySelector('.actions').getBoundingClientRect(); return actions.left >= name.right && actions.top < name.bottom && actions.bottom > name.top && [...header.querySelectorAll('button:not([hidden])')].every(button => button.getBoundingClientRect().width >= 48 && button.getBoundingClientRect().height >= 48); })"))
                assertEquals("Compact Android layout at $width", true, evaluate(scenario, "(() => { const heading = document.querySelector('.section-heading'); const name = heading.querySelector('h2').getBoundingClientRect(); const toggle = heading.querySelector('.hint').getBoundingClientRect(); const title = document.querySelector('.app-header h1').getBoundingClientRect(); const backups = document.querySelector('.app-header .actions').getBoundingClientRect(); return !document.querySelector('.app-header > div:first-child > p') && toggle.top <= name.bottom && toggle.bottom >= name.top && backups.top - title.bottom <= 12 && document.querySelector('.column-metrics').getBoundingClientRect().height < 110 && document.querySelector('.category-add-row > [data-show-category-form]').getBoundingClientRect().height <= 60; })()"))
                assertEquals("Compact backup buttons at $width", true, evaluate(scenario, "(() => { const buttons = [...document.querySelectorAll('.app-header .actions > button')].map(button => button.getBoundingClientRect()); return buttons.length === 2 && Math.abs(buttons[0].top - buttons[1].top) < 1 && buttons.every(rect => rect.height >= 48 && rect.width < window.innerWidth / 2); })()"))
                assertEquals("Compact readable category metrics at $width", true, evaluate(scenario, "[...document.querySelectorAll('.category-stats')].every(stats => { const cells = [...stats.querySelector('.column-metrics').children].map(cell => cell.getBoundingClientRect()); return stats.getBoundingClientRect().height <= 75 && cells.length === 3 && cells.every(cell => Math.abs(cell.top - cells[0].top) < 1) && [...stats.querySelectorAll('.column-metrics span')].every(label => parseFloat(getComputedStyle(label).fontSize) >= 12); })"))
            }
            scenario.onActivity { activity ->
                val web = findWeb(activity.window.decorView)!!
                web.layoutParams = web.layoutParams.apply { width = ViewGroup.LayoutParams.MATCH_PARENT }
                web.requestLayout()
            }
            evaluate(scenario, """
                currentState.incomes = [{id:'work', name:'Work', amount:1000, frequency:'biweekly', notes:'Income note'}];
                currentState.expenses = [
                  {id:'rent', name:'Rent', amount:100, multiplier:1, frequency:'monthly', categoryId:'default-needs', group:'Home', sortOrder:1},
                  {id:'power', name:'Power', amount:20, multiplier:0.5, frequency:'annually', categoryId:'default-needs', group:'Home / Utilities', sortOrder:2}
                ];
                currentState.notes = 'Private notes';
                currentState.app.collapsedGroups = {'default-needs:Home / Utilities':true};
                saveState(currentState); render(currentState);
            """.trimIndent())
            waitFor(scenario, "document.querySelector('[data-save-status]').textContent === 'Saved'")
            evaluate(scenario, "document.querySelector('.category-stats').scrollIntoView({block:'center'});")
            SystemClock.sleep(200)
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .executeShellCommand("screencap -p /data/local/tmp/mybudgeter-compact-metrics.png").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .executeShellCommand("screencap -p /data/local/tmp/mybudgeter-phone.png").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            evaluate(scenario, "document.querySelector('.category-column').scrollIntoView();")
            SystemClock.sleep(200)
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .executeShellCommand("screencap -p /data/local/tmp/mybudgeter-category.png").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            evaluate(scenario, "window.scrollTo(0, 0);")
            assertEquals(2172.62, (evaluate(scenario, "budget.getBudgetSummary(currentState).monthlyIncome") as Number).toDouble(), 0.000001)
            evaluate(scenario, "document.querySelector('[data-edit-income=work]').click();")
            evaluate(scenario, """
                var editor = document.querySelector('[data-edit-income-form=work]');
                currentState.app.boardPeriod = 'annual'; currentState.app.isBudgetBoardOpen = false; currentState.app.isNotesOpen = false; currentState.app.isFaqOpen = true; saveState(currentState);
                editor.elements.name.value = 'Unsubmitted phone draft';
                editor.elements.name.dispatchEvent(new Event('input', {bubbles:true}));
                window.budgetMobile.checkpoint();
            """.trimIndent())
            SystemClock.sleep(500)
            scenario.recreate()
            waitFor(scenario, "document.querySelector('[data-edit-income-form=work]')?.elements.name.value === 'Unsubmitted phone draft'")
            assertEquals("annual", evaluate(scenario, "currentState.app.boardPeriod"))
            assertEquals(false, evaluate(scenario, "document.querySelector('[data-group-name=Home]').classList.contains('collapsed')"))
            assertEquals(true, evaluate(scenario, "document.querySelector('[data-group-name=\"Home / Utilities\"]').classList.contains('collapsed')"))
            assertEquals(true, evaluate(scenario, "currentState.app.isIncomeOpen"))
            assertEquals(false, evaluate(scenario, "document.querySelector('[data-toggle-income]').closest('section').querySelector('.collapsible-body').hidden"))
            assertEquals(true, evaluate(scenario, "currentState.app.isBudgetBoardOpen === false && currentState.app.isNotesOpen === false && document.querySelector('.faq-card > details').open"))
            assertEquals(true, evaluate(scenario, "document.querySelector('.board').hidden && document.querySelector('.category-form-meta').hidden && !document.querySelector('.summary-grid-wide').hidden && document.querySelector('.notes-textarea').hidden"))
            evaluate(scenario, "document.querySelector('[data-toggle-budget-board]').click(); document.querySelector('[data-toggle-notes]').click();")
            assertEquals(true, evaluate(scenario, "document.querySelector('[data-edit-income-form=work]').hidden"))
            evaluate(scenario, "document.querySelector('[data-edit-income=work]').click();")
            assertEquals(false, evaluate(scenario, "document.querySelector('[data-edit-income-form=work]').hidden"))
            assertEquals("Unsubmitted phone draft", evaluate(scenario, "document.querySelector('[data-edit-income-form=work]').elements.name.value"))
            assertEquals("Work", evaluate(scenario, "currentState.incomes[0].name"))
            evaluate(scenario, "document.querySelector('[data-cancel-edit-income]').click();")
            evaluate(scenario, """
                budget.moveBudgetEntry(currentState, {type:'group', categoryId:'default-needs', group:'Home'}, {categoryId:'default-wants', placement:'append'});
                saveState(currentState); render(currentState);
            """.trimIndent())
            waitFor(scenario, "currentState.expenses.every(item => item.categoryId === 'default-wants')")
            assertEquals(true, evaluate(scenario, "currentState.app.collapsedGroups['default-wants:Home / Utilities']"))
            evaluate(scenario, "window.confirm = () => true; window.alert = message => window.lastAlert = message; window.importFinished = false; importBudget(null).then(() => window.importFinished = true);")
            waitFor(scenario, "window.importFinished === true")
            assertEquals("Private notes", evaluate(scenario, "currentState.notes"))
            evaluate(scenario, "window.importFinished = false; importBudget('{\"schema\":\"wrong\"}').then(() => window.importFinished = true);")
            waitFor(scenario, "window.importFinished === true")
            assertEquals("Private notes", evaluate(scenario, "currentState.notes"))
            assertEquals(true, evaluate(scenario, "window.lastAlert.includes('Unsupported save file')"))
            evaluate(scenario, "window.roundTrip = JSON.stringify(budget.createSavePayload(currentState)); window.importFinished = false; importBudget(window.roundTrip).then(() => window.importFinished = true);")
            waitFor(scenario, "window.importFinished === true")
            assertEquals(0.5, evaluate(scenario, "currentState.expenses[1].multiplier"))
            evaluate(scenario, "window.budgetMobile.checkpoint();")
            SystemClock.sleep(500)
        }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            assertEquals("Private notes", evaluate(scenario, "currentState.notes"))
            assertEquals("default-wants", evaluate(scenario, "currentState.expenses[0].categoryId"))
            scenario.onActivity { activity ->
                activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            }
            waitFor(scenario, "window.budgetReady === true && window.innerWidth > window.innerHeight")
            assertEquals("Private notes", evaluate(scenario, "currentState.notes"))
            evaluate(scenario, """
                currentState.expenses.push({id:'deep',name:'A very long recurring expense name that must wrap on narrow screens',amount:1000000,multiplier:1,frequency:'monthly',categoryId:'default-wants',group:'Home / Utilities / Electric / Meter / Billing / Account / History / Details',sortOrder:99});
                saveState(currentState); render(currentState);
            """.trimIndent())
            scenario.onActivity { activity -> findWeb(activity.window.decorView)!!.settings.textZoom = 150 }
            SystemClock.sleep(200)
            assertEquals(true, evaluate(scenario, "document.documentElement.scrollWidth <= window.innerWidth"))
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('.category-column')].every((card, index, cards) => !index || card.getBoundingClientRect().top > cards[index-1].getBoundingClientRect().bottom)"))
        }
    }

    @Test fun unreadableBudgetIsPreservedAndCanBeRecoveredByImport() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.filesDir, "budget.json")
        file.writeText("unreadable original")
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "Boolean(document.querySelector('.recovery-card'))")
            assertEquals("unreadable original", file.readText())
            evaluate(scenario, "window.confirm = () => true; window.importFinished = false; importBudget(JSON.stringify(budget.createEmptyState())).then(() => window.importFinished = true);")
            waitFor(scenario, "window.importFinished === true && window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            assertTrue(file.readText().contains("MyBudgeter-budget-v1"))
        }
    }

    @Test fun failedSaveRetainsWorkingBudgetAndRetryPersistsLatestChanges() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.filesDir, "budget.json")
        file.delete()
        File(context.filesDir, "session.json").delete()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            file.delete()
            assertTrue("Could not create failed-save fixture", file.mkdir())
            File(file, "block-replacement").writeText("fixture")
            evaluate(scenario, "currentState.notes = 'Retained after failure'; saveState(currentState); flushSave();")
            waitFor(scenario, "Boolean(document.querySelector('.storage-error'))")
            assertEquals("Retained after failure", evaluate(scenario, "currentState.notes"))
            File(file, "block-replacement").delete()
            file.delete()
            evaluate(scenario, "currentState.notes = 'Older retry'; saveState(currentState); flushSave(); currentState.notes = 'Newest retry'; saveState(currentState); window.retriesFinished = false; flushSave().then(() => window.retriesFinished = true);")
            waitFor(scenario, "window.retriesFinished === true && !document.querySelector('.storage-error') && document.querySelector('[data-save-status]').textContent === 'Saved'")
            assertTrue(file.readText().contains("Newest retry"))
        }
    }

    @Test fun touchDraggingSwapsCategoriesAndItemsKeepMoveDialog() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            evaluate(scenario, "currentState = budget.createEmptyState(); render(currentState);")
            drag(scenario, "[data-category-id=default-needs] h3", "[data-category-id=default-wants]", 0.5, edgeScroll = true)
            assertEquals("default-wants", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
            assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('dialog[open]'))"))
            drag(scenario, "[data-category-id=default-needs] h3", "[data-category-id=default-wants]", 0.5, cancel = true)
            assertEquals("default-wants", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
            drag(scenario, "[data-category-id=default-needs] h3", "[data-category-id=default-wants]", 0.5)
            assertEquals("default-needs", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
            drag(scenario, "[data-category-id=default-needs] h3", "[data-category-id=default-wants]", 0.5, scrollOnly = true)
            assertEquals("default-needs", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
            assertEquals(0, evaluate(scenario, "document.querySelectorAll('[data-order-step]').length"))
            evaluate(scenario, "document.querySelector('[data-category-id=default-needs] h3').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', altKey:true, bubbles:true}));")
            assertEquals("default-wants", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
            evaluate(scenario, "document.querySelector('[data-category-id=default-needs] h3').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', altKey:true, bubbles:true}));")
            assertEquals("default-needs", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))

            evaluate(scenario, "currentState.expenses = [{id:'test-item',name:'Item',amount:10,multiplier:1,frequency:'monthly',categoryId:'default-needs'}]; render(currentState); document.querySelector('.expense-item .actions button').click();")
            assertEquals(true, evaluate(scenario, "Boolean(document.querySelector('dialog[open]'))"))
            evaluate(scenario, "var dialog = document.querySelector('dialog'); dialog.querySelector('input[type=search]').value = 'nothing'; dialog.querySelector('input[type=search]').dispatchEvent(new Event('input')); dialog.querySelector('select').value = 'default-wants'; dialog.querySelector('select').dispatchEvent(new Event('change')); dialog.querySelector('form').requestSubmit();")
            assertEquals("default-wants", evaluate(scenario, "currentState.expenses[0].categoryId"))
            evaluate(scenario, """
                document.querySelector('[data-edit-category=default-needs]').click();
                var name = document.querySelector('[data-edit-category-form=default-needs]').elements.name;
                name.value = 'Unsubmitted category'; name.dispatchEvent(new Event('input',{bubbles:true}));
                window.confirm = () => true; window.budgetMobile.handleBack();
            """.trimIndent())
            assertEquals("Needs", evaluate(scenario, "currentState.categories.find(category => category.id === 'default-needs').name"))
        }
    }

    @Test fun touchDraggingKeepsHierarchyAndMoveOnlyTransfers() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            evaluate(scenario, """
                currentState = budget.createEmptyState();
                currentState.expenses = [
                  {id:'first', name:'First', amount:10, multiplier:1, frequency:'monthly', categoryId:'default-needs', group:'', sortOrder:1},
                  {id:'inside', name:'Inside', amount:20, multiplier:1, frequency:'monthly', categoryId:'default-needs', group:'Home', sortOrder:2},
                  {id:'nested', name:'Nested', amount:30, multiplier:1, frequency:'monthly', categoryId:'default-needs', group:'Home / Child', sortOrder:3},
                  {id:'last', name:'Last', amount:40, multiplier:1, frequency:'monthly', categoryId:'default-needs', group:'', sortOrder:4}
                ];
                render(currentState);

            """.trimIndent())
            assertGroupItemControls(scenario)
            drag(scenario, "[data-expense-id=first] strong", "[data-group-name=Home]", 0.95)
            assertEquals("inside,nested,first,last", evaluate(scenario, "budget.sortExpenses(currentState.expenses).map(item => item.id).join(',')"))
            drag(scenario, "[data-group-name=Home] h4", "[data-expense-id=first]", 0.95)
            drag(scenario, "[data-expense-id=inside] strong", "[data-group-name='Home / Child']", 0.95)
            assertEquals("first,nested,inside,last", evaluate(scenario, "budget.sortExpenses(currentState.expenses).map(item => item.id).join(',')"))
            assertEquals("Home", evaluate(scenario, "currentState.expenses.find(item => item.id === 'inside').group"))
            assertEquals("Home / Child", evaluate(scenario, "currentState.expenses.find(item => item.id === 'nested').group"))
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('.expense-item')].every(item => { const text = item.querySelector(':scope > div:not(.actions)').getBoundingClientRect(); const actions = item.querySelector(':scope > .actions').getBoundingClientRect(); return actions.left >= text.right && actions.top < text.bottom && actions.bottom > text.top; })"))
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('.item-group-header')].every(header => { const toggle = header.querySelector('.group-toggle').getBoundingClientRect(); const name = header.querySelector('h4').getBoundingClientRect(); return Math.abs(toggle.width - 48) < 1 && Math.abs(toggle.height - 48) < 1 && name.left >= toggle.right && header.querySelector('.actions').getBoundingClientRect().left >= name.right && header.querySelector('.actions').getBoundingClientRect().top <= name.bottom && getComputedStyle(header.querySelector('h4')).textAlign === 'left' && parseFloat(getComputedStyle(header.querySelector('h4')).fontSize) >= 17; })"))
            evaluate(scenario, "document.querySelector('[data-group-name=Home]').scrollIntoView({block:'start'});")
            SystemClock.sleep(200)
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .executeShellCommand("screencap -p /data/local/tmp/mybudgeter-compact-items.png").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            assertEquals(0, evaluate(scenario, "document.querySelectorAll('[data-order-step]').length"))
            assertEquals("Having issues? Contact my.development.life@gmail.com", evaluate(scenario, "document.querySelector('.app-footer').textContent"))
            evaluate(scenario, "document.querySelector('[data-expense-id=inside] .actions button').click();")
            assertEquals(2, evaluate(scenario, "document.querySelectorAll('dialog select').length"))
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('dialog select')[1].options].every(option => !option.textContent.startsWith('Item:'))"))
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('dialog label')].every(label => !label.textContent.includes('Position'))"))
            evaluate(scenario, "var dialog = document.querySelector('dialog'); dialog.querySelectorAll('select')[1].value = 'root'; dialog.querySelector('form').requestSubmit();")
            assertEquals("", evaluate(scenario, "currentState.expenses.find(item => item.id === 'inside').group"))
            evaluate(scenario, "currentState.expenses.push({id:'peer',name:'Peer',amount:5,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'Home / Child',sortOrder:99}); render(currentState);")
            drag(scenario, "[data-expense-id=peer] strong", "[data-expense-id=nested]", 0.5)
            assertEquals("Home / Child / New Group 1", evaluate(scenario, "currentState.expenses.find(item => item.id === 'peer').group"))
            assertEquals("Home / Child / New Group 1", evaluate(scenario, "currentState.expenses.find(item => item.id === 'nested').group"))

        }
    }

    @Test fun entryMenusRouteActionsAndDismissWithoutChangingBudget() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            evaluate(scenario, "currentState = budget.createEmptyState(); currentState.app.isIncomeOpen = true; currentState.incomes = [{id:'work',name:'Work',amount:100,frequency:'monthly'}]; currentState.expenses = [{id:'menu-item',name:'Item',amount:10,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'Home'}]; render(currentState);")
            assertEntryMenu(scenario, ".income-item", "Edit,Remove")
            assertEntryMenu(scenario, "[data-category-id=default-needs] > .column-header", "Move,Edit,Color,Remove")
            assertCategoryColor(scenario)
            assertEntryMenu(scenario, "[data-group-name=Home] > .item-group-header", "Move,Edit,Remove")
            assertEntryMenu(scenario, "[data-expense-id=menu-item]", "Move,Edit,Remove")
            evaluate(scenario, "document.querySelector('[data-expense-id=menu-item] .entry-menu-toggle').click(); document.body.click();")
            assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('.entry-action-menu'))"))
            evaluate(scenario, "document.querySelector('[data-expense-id=menu-item] .entry-menu-toggle').click(); window.budgetMobile.handleBack();")
            assertEquals(false, evaluate(scenario, "Boolean(document.querySelector('.entry-action-menu'))"))
            evaluate(scenario, "document.querySelector('[data-expense-id=menu-item] .entry-menu-toggle').click(); document.querySelectorAll('.entry-action-menu button')[1].click();")
            assertEquals(true, evaluate(scenario, "Boolean(document.querySelector('[data-edit-expense-form=menu-item]'))"))
            evaluate(scenario, "document.querySelector('[data-edit-expense-form=menu-item] [data-cancel-edit-expense]').click();")
            evaluate(scenario, "document.querySelector('[data-expense-id=menu-item] .entry-menu-toggle').click(); document.querySelectorAll('.entry-action-menu button')[2].click();")
            assertEquals(true, evaluate(scenario, "Boolean(document.querySelector('.delete-dialog-backdrop'))"))
            evaluate(scenario, "window.budgetMobile.handleBack();")
            assertEquals(1, evaluate(scenario, "currentState.expenses.length"))
            evaluate(scenario, "document.querySelector('[data-category-id=default-needs] > .column-header .entry-menu-toggle').click(); document.querySelector('.entry-action-menu button').click(); document.querySelectorAll('dialog select')[0].value = 'default-wants'; document.querySelectorAll('dialog select')[1].value = 'swap'; document.querySelector('dialog form').requestSubmit();")
            assertEquals("default-wants", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
        }
    }

    @Test fun nativeDocumentPickerCancellationLeavesBudgetUnchanged() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            val original = evaluate(scenario, "JSON.stringify(currentState)")
            val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
            fun cancelPicker() {
                val deadline = SystemClock.uptimeMillis() + 10000
                var found = false
                while (SystemClock.uptimeMillis() < deadline) {
                    val root = automation.rootInActiveWindow
                    if (root?.packageName?.toString()?.contains("documentsui") == true) {
                        found = true
                        break
                    }
                    SystemClock.sleep(100)
                }
                assertTrue("Android document picker did not open", found)
                assertTrue(automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK))
            }
            evaluate(scenario, "window.pickerDone = false; platform.importFile().then(value => { window.pickerValue = value; window.pickerDone = true; });")
            cancelPicker()
            waitFor(scenario, "window.pickerDone === true && window.pickerValue === null")
            assertEquals(original, evaluate(scenario, "JSON.stringify(currentState)"))
            evaluate(scenario, "window.pickerDone = false; platform.exportFile(JSON.stringify(budget.createSavePayload(currentState))).then(value => { window.pickerValue = value; window.pickerDone = true; });")
            cancelPicker()
            waitFor(scenario, "window.pickerDone === true && window.pickerValue === false")
            assertEquals(original, evaluate(scenario, "JSON.stringify(currentState)"))
        }
    }

    @Test fun browserModeRetainsDragHandlersAndCompatibleLocalStorage() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "window.budgetReady === true && Boolean(document.querySelector('[data-toggle-income]'))")
            scenario.onActivity { activity ->
                findWeb(activity.window.decorView)!!.loadUrl("${MainActivity.ORIGIN}/assets/index.html")
            }
            waitFor(scenario, "window.budgetPlatform?.isAndroid === false && Boolean(document.querySelector('[draggable]'))")
            assertEquals("Michael Yeh", evaluate(scenario, "document.querySelector('.site-brand').textContent"))
            assertEquals("My Budget Planner", evaluate(scenario, "document.querySelector('.app-header h1').firstChild.textContent.trim()"))
            evaluate(scenario, "currentState.app.isIncomeOpen = true; currentState.app.isBudgetBoardOpen = false; currentState.app.isNotesOpen = false; currentState.app.isFaqOpen = true; currentState.app.boardPeriod = 'semi-monthly'; currentState.expenses = [{id:'startup-group',name:'Nested',amount:10,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'Home / Child',sortOrder:1}]; currentState.app.collapsedGroups = {'default-needs:Home':false,'default-needs:Home / Child':true}; saveState(currentState); window.incomeSaved = false; flushSave().then(() => window.incomeSaved = true);")
            waitFor(scenario, "window.incomeSaved === true")
            evaluate(scenario, "window.reloadMarker = true;")
            scenario.onActivity { activity -> findWeb(activity.window.decorView)!!.reload() }
            waitFor(scenario, "window.budgetReady === true && !window.reloadMarker && currentState.app.isIncomeOpen === true")
            assertEquals(true, evaluate(scenario, "document.querySelectorAll('.item-group').length === 2 && !document.querySelector('[data-group-name=Home]').classList.contains('collapsed') && document.querySelector('[data-group-name=\"Home / Child\"]').classList.contains('collapsed') && currentState.app.boardPeriod === 'semi-monthly'"))
            assertEquals("Spending", evaluate(scenario, "document.querySelector('[data-category-id=default-needs] .column-metrics > div:nth-child(2) > span').textContent"))
            assertEquals("Saving", evaluate(scenario, "document.querySelector('[data-category-id=default-savings] .column-metrics > div:nth-child(2) > span').textContent"))
            assertEquals(false, evaluate(scenario, "document.querySelector('[data-toggle-income]').closest('section').querySelector('.collapsible-body').hidden"))
            assertEquals(true, evaluate(scenario, "document.querySelector('.board').hidden && document.querySelector('.category-form-meta').hidden && !document.querySelector('.summary-grid-wide').hidden && document.querySelector('.notes-textarea').hidden && document.querySelector('.faq-card > details').open"))
            evaluate(scenario, "document.querySelector('[data-toggle-budget-board]').click(); document.querySelector('[data-toggle-notes]').click();")
            assertEntryMenu(scenario, "[data-category-id=default-needs] > .column-header", "Edit,Color,Remove")
            assertCategoryColor(scenario)
            assertEquals(true, evaluate(scenario, "[...document.querySelectorAll('.column-header > .actions > button:not(.entry-menu-toggle)')].every(button => button.hidden)"))
            evaluate(scenario, "currentState = budget.createEmptyState(); render(currentState);")
            evaluate(scenario, "currentState.expenses = [{id:'row-test',name:'Item',amount:10,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'Home'}]; render(currentState);")
            assertGroupItemControls(scenario)
            assertEntryMenu(scenario, "[data-expense-id=row-test]", "Edit,Remove")
            assertEntryMenu(scenario, "[data-group-name=Home] > .item-group-header", "Edit,Remove")
            assertEntryMenu(scenario, "[data-category-id=default-needs] > .column-header", "Edit,Color,Remove")

            evaluate(scenario, """
                currentState.expenses.push({id:'row-peer',name:'Peer',amount:5,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'Home',sortOrder:99}); render(currentState);
                var itemSource = document.querySelector('[data-expense-id=row-peer]');
                var itemTarget = document.querySelector('[data-expense-id=row-test]');
                var itemRect = itemTarget.getBoundingClientRect();
                var itemTransfer = new DataTransfer();
                itemSource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:itemTransfer}));
                itemTarget.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:itemTransfer,clientX:itemRect.left+itemRect.width/2,clientY:itemRect.top+itemRect.height/2}));
                itemTarget.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:itemTransfer}));
            """.trimIndent())
            assertEquals("Home / New Group 1", evaluate(scenario, "currentState.expenses.find(item => item.id === 'row-peer').group"))
            assertEquals("Home / New Group 1", evaluate(scenario, "currentState.expenses.find(item => item.id === 'row-test').group"))

            for (placement in listOf("before", "after")) {
                evaluate(scenario, """
                    currentState.expenses = [
                        {id:'nested',name:'Nested',amount:10,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'Home / Child',sortOrder:2},
                        {id:'outside',name:'Outside',amount:5,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'',sortOrder:1},
                        {id:'tail',name:'Tail',amount:5,multiplier:1,frequency:'monthly',categoryId:'default-needs',group:'',sortOrder:3}
                    ]; render(currentState);
                    var edgeSource = document.querySelector('[data-expense-id=outside]');
                    var edgeTarget = document.querySelector('[data-group-name="Home / Child"] > .item-group-header');
                    var edgeRect = edgeTarget.parentElement.getBoundingClientRect();
                    var edgeTransfer = new DataTransfer();
                    edgeSource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:edgeTransfer}));
                    edgeTarget.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:edgeTransfer,clientX:edgeRect.left+20,clientY:edgeRect.top+edgeRect.height*${if (placement == "before") "0.1" else "0.9"}}));
                    edgeTarget.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:edgeTransfer}));
                """.trimIndent())
                assertEquals("Home", evaluate(scenario, "currentState.expenses.find(item => item.id === 'outside').group"))
                assertEquals(if (placement == "before") "outside,nested,tail" else "nested,outside,tail", evaluate(scenario, "budget.sortExpenses(currentState.expenses).map(item => item.id).join(',')"))
            }

            evaluate(scenario, """
                var source = document.querySelector('[data-category-id=default-needs]');
                var target = document.querySelector('[data-category-id=default-savings]');
                var rect = target.getBoundingClientRect();
                var transfer = new DataTransfer();
                source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
                target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:transfer,clientX:rect.left+rect.width/2,clientY:rect.top+20}));
                target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
                window.browserSaved = false;
                flushSave().then(() => window.browserSaved = true);
            """.trimIndent())
            waitFor(scenario, "window.browserSaved === true")
            assertEquals("default-savings", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
            assertEquals(true, evaluate(scenario, "Boolean(localStorage.getItem('MyBudgeter-save-v1'))"))
            assertEquals(1, evaluate(scenario, "document.querySelectorAll('.summary-card:not([hidden])').length"))
            assertSummarySelector(scenario)
            evaluate(scenario, "window.confirm = () => true; window.importFinished = false; importBudget(localStorage.getItem('MyBudgeter-save-v1')).then(() => window.importFinished = true);")
            waitFor(scenario, "window.importFinished === true")
            assertEquals("default-savings", evaluate(scenario, "budget.sortCategories(currentState)[0].id"))
        }
    }
}
