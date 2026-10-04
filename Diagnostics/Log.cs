using System;
using System.IO;
using System.Text;
using Colossal.PSI.Environment;

namespace ToolbarOrganizer.Diagnostics
{
    /// <summary>
    /// Complete log of the mod.
    ///
    /// Every line goes to a file written by the mod itself, Logs/ToolbarOrganizer.Full.log, and is pushed
    /// to the operating system at once, so the file is complete even when the game closes abruptly.
    /// The file of the previous session is kept as ToolbarOrganizer.Full-prev.log.
    /// The lines are also sent to the game's own logger (Logs/ToolbarOrganizer.log).
    /// </summary>
    public static class Log
    {
        private static readonly object s_Lock = new object();
        private static StreamWriter s_Writer;

        public static string FilePath
        {
            get { return Path.Combine(EnvPath.kUserDataPath, "Logs", Mod.kId + ".Full.log"); }
        }

        public static string PreviousPath
        {
            get { return Path.Combine(EnvPath.kUserDataPath, "Logs", Mod.kId + ".Full-prev.log"); }
        }

        /// <summary>Starts the file of this session; the previous one is renamed to "-prev".</summary>
        public static void Open()
        {
            lock (s_Lock)
            {
                if (s_Writer != null)
                {
                    return;
                }

                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(FilePath));

                    if (File.Exists(FilePath))
                    {
                        if (File.Exists(PreviousPath))
                        {
                            File.Delete(PreviousPath);
                        }
                        File.Move(FilePath, PreviousPath);
                    }

                    var stream = new FileStream(FilePath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
                    s_Writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };
                }
                catch (Exception e)
                {
                    s_Writer = null;
                    try
                    {
                        Mod.log.Warn("The complete log file could not be opened: " + e);
                    }
                    catch (Exception)
                    {
                    }
                }
            }
        }

        public static void Close()
        {
            lock (s_Lock)
            {
                if (s_Writer == null)
                {
                    return;
                }

                try
                {
                    s_Writer.Dispose();
                }
                catch (Exception)
                {
                }
                s_Writer = null;
            }
        }

        /// <summary>Normal event. Main thread only (it also writes to the game's logger).</summary>
        public static void Info(string message)
        {
            Write("INFO", "C#", message);
            try
            {
                Mod.log.Info(message);
            }
            catch (Exception)
            {
            }
        }

        /// <summary>Something unexpected that the mod handled. Main thread only.</summary>
        public static void Warn(string message)
        {
            Write("WARN", "C#", message);
            try
            {
                Mod.log.Warn(message);
            }
            catch (Exception)
            {
            }
        }

        /// <summary>Failure, with the exception and its stack. Main thread only.</summary>
        public static void Error(string message, Exception exception)
        {
            Write("ERROR", "C#", exception == null ? message : message + "\n" + exception);
            try
            {
                Mod.log.Error(exception == null ? message : message + " " + exception);
            }
            catch (Exception)
            {
            }
        }

        /// <summary>Detail line that goes only to the complete file. Safe from any thread.</summary>
        public static void Trace(string message)
        {
            Write("TRACE", "C#", message);
        }

        /// <summary>Line sent by the UI part. Goes only to the complete file.</summary>
        public static void Ui(string message)
        {
            Write("INFO", "UI", message);
        }

        private static void Write(string level, string source, string message)
        {
            lock (s_Lock)
            {
                if (s_Writer == null)
                {
                    return;
                }

                try
                {
                    var text = message ?? string.Empty;
                    if (text.IndexOf('\n') >= 0 || text.IndexOf('\r') >= 0)
                    {
                        // Continuation lines are indented so that every record starts with its time stamp.
                        text = text.Replace("\r\n", "\n").Replace('\r', '\n').Replace("\n", "\n    ");
                    }

                    s_Writer.Write('[');
                    s_Writer.Write(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss,fff"));
                    s_Writer.Write("] [");
                    s_Writer.Write(level);
                    s_Writer.Write("] [");
                    s_Writer.Write(source);
                    s_Writer.Write("] ");
                    s_Writer.WriteLine(text);
                }
                catch (Exception)
                {
                    // A failing log must never disturb the game.
                }
            }
        }
    }
}
