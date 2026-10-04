using System;
using System.IO;
using System.Text;
using Colossal.PSI.Environment;
using ToolbarOrganizer.Diagnostics;

namespace ToolbarOrganizer.Data
{
    /// <summary>
    /// Reads and writes the layout file (ModsData/ToolbarOrganizer/layout.json).
    /// The content is produced and interpreted by the UI; this class only stores it safely.
    /// </summary>
    public static class LayoutStore
    {
        private const int kMaxLength = 1024 * 1024;

        /// <summary>Raised after the saved layout is erased.</summary>
        public static event Action onReset;

        public static string DataDirectory
        {
            get { return Path.Combine(EnvPath.kUserDataPath, "ModsData", Mod.kId); }
        }

        private static string FilePath
        {
            get { return Path.Combine(DataDirectory, "layout.json"); }
        }

        private static string BackupPath
        {
            get { return FilePath + ".bak"; }
        }

        private static string TempPath
        {
            get { return FilePath + ".tmp"; }
        }

        /// <summary>Returns the saved layout, or an empty string when there is none or it cannot be read.</summary>
        public static string Load()
        {
            try
            {
                if (!File.Exists(FilePath))
                {
                    Log.Info("No saved layout at " + FilePath + "; defaults apply");
                    return string.Empty;
                }

                var text = File.ReadAllText(FilePath, Encoding.UTF8);
                Log.Info("Layout read from " + FilePath + ": " + text);
                if (!LooksLikeJsonObject(text))
                {
                    Log.Warn("The layout file is not valid and is ignored: " + FilePath);
                    return string.Empty;
                }

                return text;
            }
            catch (Exception e)
            {
                Log.Error("The layout file could not be read; using defaults.", e);
                return string.Empty;
            }
        }

        /// <summary>
        /// Saves the layout: writes a temporary file, then swaps it in and keeps the previous version as .bak.
        /// </summary>
        public static bool Save(string json)
        {
            if (!LooksLikeJsonObject(json))
            {
                Log.Warn("Layout rejected: it is not a JSON object or it is too large.");
                return false;
            }

            try
            {
                Directory.CreateDirectory(DataDirectory);
                File.WriteAllText(TempPath, json, new UTF8Encoding(false));

                if (File.Exists(FilePath))
                {
                    File.Copy(FilePath, BackupPath, true);
                    File.Delete(FilePath);
                }

                File.Move(TempPath, FilePath);
                Log.Info("Layout saved: " + json);
                return true;
            }
            catch (Exception e)
            {
                Log.Error("The layout file could not be written.", e);
                return false;
            }
        }

        /// <summary>Erases the saved layout (the last version stays as .bak) and notifies the UI system.</summary>
        public static void Reset()
        {
            try
            {
                if (File.Exists(FilePath))
                {
                    File.Copy(FilePath, BackupPath, true);
                    File.Delete(FilePath);
                }
            }
            catch (Exception e)
            {
                Log.Error("The layout file could not be erased.", e);
            }

            Log.Info("Saved layout erased (previous version kept as .bak)");

            var handler = onReset;
            if (handler != null)
            {
                handler();
            }
        }

        private static bool LooksLikeJsonObject(string text)
        {
            if (string.IsNullOrEmpty(text) || text.Length > kMaxLength)
            {
                return false;
            }

            var trimmed = text.Trim();
            return trimmed.Length >= 2 && trimmed[0] == '{' && trimmed[trimmed.Length - 1] == '}';
        }
    }
}
