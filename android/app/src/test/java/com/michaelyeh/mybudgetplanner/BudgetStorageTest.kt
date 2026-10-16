package com.michaelyeh.mybudgetplanner

import android.util.AtomicFile
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class BudgetStorageTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun missingBudgetIsDistinctFromUnreadableBudget() {
        val storage = BudgetStorage(temporary.root)
        assertNull(storage.load())
        val file = java.io.File(temporary.root, "budget.json")
        file.mkdir()
        assertThrows(java.io.IOException::class.java) { storage.load() }
        assertTrue(file.isDirectory)
    }

    @Test fun completedWritesAndSessionsSurviveReopening() {
        val storage = BudgetStorage(temporary.root)
        storage.save("{\"notes\":\"first\"}")
        storage.save("{\"notes\":\"second\"}")
        storage.saveSession("{\"scroll\":123}")
        val reopened = BudgetStorage(temporary.root)
        assertEquals("{\"notes\":\"second\"}", reopened.load())
        assertEquals("{\"scroll\":123}", reopened.loadSession())
    }

    @Test fun failedAtomicWritePreservesPreviousBudget() {
        val storage = BudgetStorage(temporary.root)
        storage.save("original")
        val atomic = AtomicFile(java.io.File(temporary.root, "budget.json"))
        val stream = atomic.startWrite()
        stream.write("partial".toByteArray())
        atomic.failWrite(stream)
        assertEquals("original", storage.load())
    }

    @Test fun libraryWritesRetainIndependentBudgetsAndRecoverySessions() {
        val storage = BudgetStorage(temporary.root)
        val data = """{"schema":"MyBudgeter-budget-v1","incomes":[],"categories":[],"expenses":[]}"""
        val library = """{"schema":"MyBudgeter-library-v1","activeBudgetId":"second","budgets":[{"id":"first","name":"First","data":$data},{"id":"second","name":"Second","data":$data}]}"""
        val recovery = """{"schema":"MyBudgeter-sessions-v1","budgets":{"first":{"budgetId":"first","forms":[]},"second":{"budgetId":"second","forms":[]}}}"""
        storage.save(library)
        storage.saveSession(recovery)
        val reopened = BudgetStorage(temporary.root)
        assertEquals(library, reopened.load())
        assertEquals(recovery, reopened.loadSession())
        val activity = MainActivity()
        val validate = MainActivity::class.java.getDeclaredMethod("validateLibrary", String::class.java).apply { isAccessible = true }
        validate.invoke(activity, library)
        validate.invoke(activity, data)
        for (invalid in listOf(
            library.replace("\"activeBudgetId\":\"second\"", "\"activeBudgetId\":\"missing\""),
            library.replace("\"id\":\"second\"", "\"id\":\"first\""),
            library.replace("\"name\":\"Second\"", "\"name\":\"FIRST\""),
            library.replace("\"name\":\"Second\"", "\"name\":\" \""),
        )) assertThrows(java.lang.reflect.InvocationTargetException::class.java) { validate.invoke(activity, invalid) }
        val exportValidator = MainActivity::class.java.getDeclaredMethod("validateBudget", String::class.java).apply { isAccessible = true }
        assertThrows(java.lang.reflect.InvocationTargetException::class.java) { exportValidator.invoke(activity, library) }
    }
}
