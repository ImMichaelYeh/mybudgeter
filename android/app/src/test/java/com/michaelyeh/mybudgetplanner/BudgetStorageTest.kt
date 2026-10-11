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
}
