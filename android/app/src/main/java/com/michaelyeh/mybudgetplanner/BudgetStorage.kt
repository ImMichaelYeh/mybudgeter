package com.michaelyeh.mybudgetplanner

import android.util.AtomicFile
import java.io.File

/** AtomicFile preserves the previous budget when a replacement write fails. */
class BudgetStorage(directory: File) {
    private val budget = AtomicFile(File(directory, "budget.json"))
    private val session = AtomicFile(File(directory, "session.json"))

    fun load(): String? = read(budget)
    fun loadSession(): String? = read(session)
    fun save(value: String) = write(budget, value)
    fun saveSession(value: String) = write(session, value)

    private fun read(file: AtomicFile): String? {
        if (!file.baseFile.exists() && !File("${file.baseFile}.bak").exists()) return null
        return file.openRead().bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun write(file: AtomicFile, value: String) {
        val stream = file.startWrite()
        try {
            stream.write(value.toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
            // AtomicFile logs some rename failures instead of throwing; do not acknowledge those as Saved.
            check(file.baseFile.isFile && read(file) == value) { "The replacement file was not committed" }
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }
}
