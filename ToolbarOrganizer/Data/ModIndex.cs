using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Colossal.IO.AssetDatabase;
using ToolbarOrganizer.Diagnostics;
using PsiMod = Colossal.PSI.Common.Mod;

namespace ToolbarOrganizer.Data
{
    /// <summary>
    /// Links toolbar buttons to the mods that own them.
    ///
    /// Every UI module the game knows gives a mod folder. The official mod name (the one shown on Paradox
    /// Mods) comes from the list of mods of the active playset, matched by the id in the folder name.
    /// A button is linked to its mod by the source code of the component that draws it, which exists
    /// inside the UI module of exactly one mod; the icon file is the second route.
    /// </summary>
    public static class ModIndex
    {
        /// <summary>One mod folder with at least one UI module.</summary>
        public class ModuleEntry
        {
            /// <summary>Folder that holds the UI module(s) of the mod.</summary>
            public string directory;

            /// <summary>Paradox Mods id taken from the folder name ("125342_18" gives "125342"); empty for local mods.</summary>
            public string modId = string.Empty;

            /// <summary>True for mods in the local Mods folder: their content can change without a new folder.</summary>
            public bool isLocal;

            public readonly List<string> moduleNames = new List<string>();
            public readonly List<string> modulePaths = new List<string>();

            /// <summary>Filled by <see cref="Build"/>: official mod name; folder name for local mods.</summary>
            public string displayName;

            /// <summary>Filled by <see cref="Build"/>: where the name came from (paradox, folder, module).</summary>
            public string nameSource;

            /// <summary>Filled by <see cref="Build"/>: UI module name used as the stable id of the mod.</summary>
            public string moduleName;

            /// <summary>Filled by <see cref="Build"/>: the mod adds something to one of the two top toolbars.</summary>
            public bool usesToolbar;

            /// <summary>Filled by <see cref="Build"/>: image files, relative to the folder, lower case.</summary>
            public List<string> images = new List<string>();
        }

        public class IndexResult
        {
            public string json;
            public string report;
        }

        /// <summary>A piece of component source code sent by the UI, to be found inside the UI modules.</summary>
        public class Probe
        {
            public string id;
            public string text;
        }

        public class ProbeResult
        {
            /// <summary>Probe id -> UI module names whose file contains the text.</summary>
            public Dictionary<string, List<string>> hits;
            public string report;
        }

        private static readonly string[] kToolbarHooks = { "GameTopLeft", "GameTopRight" };
        private static readonly string[] kImageExtensions = { ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp" };
        private const int kMaxDepth = 3;
        private const int kMaxFilesPerMod = 400;
        private const string kCacheHeader = "TOOLBARORGANIZER-MODINDEX\t1";
        private const int kMinSkeletonLength = 20;

        private static string CachePath
        {
            get { return Path.Combine(LayoutStore.DataDirectory, "modindex.cache"); }
        }

        /// <summary>
        /// Lists the mod folders that have UI modules. Must run on the main thread (it reads the asset database).
        /// </summary>
        public static List<ModuleEntry> CollectModules()
        {
            var result = new List<ModuleEntry>();
            var byDirectory = new Dictionary<string, ModuleEntry>(StringComparer.OrdinalIgnoreCase);

            foreach (var asset in AssetDatabase.global.GetAssets(SearchFilter<UIModuleAsset>.ByCondition(a => true, true)))
            {
                try
                {
                    var path = asset.path;
                    if (string.IsNullOrEmpty(path))
                    {
                        continue;
                    }

                    var name = asset.name;
                    if (name == Mod.kId)
                    {
                        continue;
                    }

                    var directory = Path.GetDirectoryName(path);
                    if (string.IsNullOrEmpty(directory))
                    {
                        continue;
                    }

                    ModuleEntry entry;
                    if (!byDirectory.TryGetValue(directory, out entry))
                    {
                        entry = new ModuleEntry { directory = directory, modId = ModIdFromPath(directory) };
                        byDirectory.Add(directory, entry);
                        result.Add(entry);

                        try
                        {
                            entry.isLocal = asset.isLocal;
                        }
                        catch (Exception)
                        {
                            entry.isLocal = entry.modId.Length == 0;
                        }
                    }

                    entry.moduleNames.Add(name);
                    entry.modulePaths.Add(path);
                }
                catch (Exception e)
                {
                    Log.Error("UI module skipped while indexing.", e);
                }
            }

            Log.Info("UI modules found in the asset database: " + result.Count + " mod folders");
            return result;
        }

        /// <summary>
        /// Asks the Paradox Mods service of the game for the mods of the active playset (id and official
        /// name). Returns null when the service is not there. Must be called on the main thread; the
        /// returned task completes on its own and is only read afterwards.
        /// The call goes through reflection so the mod does not depend on the Paradox SDK assemblies.
        /// </summary>
        public static Task<HashSet<PsiMod>> RequestOfficialNames()
        {
            try
            {
                var manager = Colossal.PSI.Common.PlatformManager.instance;
                if (manager == null)
                {
                    Log.Warn("Official names: the platform manager is not available");
                    return null;
                }

                foreach (var backend in manager.modsBackends)
                {
                    if (backend == null)
                    {
                        continue;
                    }

                    var method = backend.GetType().GetMethod("GetModsInActivePlayset", BindingFlags.Instance | BindingFlags.Public, null, Type.EmptyTypes, null);
                    if (method == null)
                    {
                        Log.Trace("Official names: " + backend.GetType().FullName + " has no playset list");
                        continue;
                    }

                    var task = method.Invoke(backend, null) as Task<HashSet<PsiMod>>;
                    if (task != null)
                    {
                        Log.Info("Official names: requested from " + backend.GetType().FullName);
                        return task;
                    }

                    Log.Warn("Official names: " + backend.GetType().FullName + " returned an unexpected type");
                }

                Log.Warn("Official names: no mods service offers the playset list");
            }
            catch (Exception e)
            {
                Log.Error("Official names: the request failed.", e);
            }

            return null;
        }

        /// <summary>Turns the answer of <see cref="RequestOfficialNames"/> into id -> official name.</summary>
        public static Dictionary<string, string> ReadOfficialNames(HashSet<PsiMod> mods)
        {
            var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (mods == null)
            {
                return names;
            }

            var sample = 0;
            foreach (var mod in mods)
            {
                if (!string.IsNullOrEmpty(mod.id) && !string.IsNullOrEmpty(mod.displayName))
                {
                    names[mod.id] = mod.displayName.Trim();
                }

                // A few entries as they come from the service, to check the format of the id.
                if (sample < 8)
                {
                    sample++;
                    Log.Trace("Official names sample: id=\"" + mod.id + "\" name=\"" + mod.displayName + "\" version=\"" + mod.version + "\" path=\"" + mod.path + "\"");
                }
            }

            return names;
        }

        /// <summary>
        /// Completes the entries (name, toolbar use, image files) and builds the index sent to the UI.
        /// Folders already known from the cache file are not read again; only new or updated mods and local
        /// mods are scanned. Safe to run off the main thread; it does not touch game objects.
        /// </summary>
        public static IndexResult Build(List<ModuleEntry> modules, Dictionary<string, string> officialNames)
        {
            var watch = Stopwatch.StartNew();
            var cache = ReadCache();
            var scanned = 0;
            var fromCache = 0;
            var cacheable = 0;

            foreach (var module in modules)
            {
                if (!module.isLocal)
                {
                    cacheable++;
                }

                CacheEntry cached = null;
                var known = !module.isLocal && cache.TryGetValue(module.directory, out cached) && cached != null &&
                            module.moduleNames.Contains(cached.moduleName);
                if (known)
                {
                    module.moduleName = cached.moduleName;
                    module.usesToolbar = cached.usesToolbar;
                    module.images = cached.images;
                    fromCache++;
                }
                else
                {
                    Scan(module);
                    scanned++;
                }

                string official;
                if (module.modId.Length > 0 && officialNames.TryGetValue(module.modId, out official))
                {
                    module.displayName = official;
                    module.nameSource = "paradox";
                }
                else if (module.isLocal || module.modId.Length == 0)
                {
                    var folder = Path.GetFileName(module.directory);
                    module.displayName = string.IsNullOrEmpty(folder) ? module.moduleName : folder;
                    module.nameSource = "folder";
                }
                else
                {
                    module.displayName = module.moduleName;
                    module.nameSource = "module";
                }

                Log.Trace("Index: module=" + module.moduleName + " id=" + (module.modId.Length > 0 ? module.modId : "-") +
                          " name=\"" + module.displayName + "\" (" + module.nameSource + ") toolbar=" + module.usesToolbar +
                          " images=" + module.images.Count + " local=" + module.isLocal + " " + (known ? "cache" : "scanned") +
                          " folder=" + module.directory);
            }

            // Rewritten when a non-local folder was scanned or when the cache holds folders that no longer exist.
            if (fromCache != cacheable || cache.Count != cacheable)
            {
                WriteCache(modules);
            }

            var sb = new StringBuilder(32 * 1024);
            var toolbarMods = 0;
            var imageCount = 0;
            var unnamed = 0;

            sb.Append("{\"mods\":[");
            foreach (var module in modules)
            {
                if (!module.usesToolbar)
                {
                    continue;
                }

                if (toolbarMods > 0)
                {
                    sb.Append(',');
                }
                toolbarMods++;
                imageCount += module.images.Count;
                if (module.nameSource == "module")
                {
                    unnamed++;
                }

                sb.Append("{\"m\":");
                AppendJsonString(sb, module.moduleName);
                sb.Append(",\"n\":");
                AppendJsonString(sb, module.displayName);
                sb.Append(",\"f\":[");
                for (var i = 0; i < module.images.Count; i++)
                {
                    if (i > 0)
                    {
                        sb.Append(',');
                    }
                    AppendJsonString(sb, module.images[i]);
                }
                sb.Append("]}");
            }
            sb.Append("]}");

            watch.Stop();
            return new IndexResult
            {
                json = sb.ToString(),
                report = "Mod index: " + modules.Count + " mod folders with UI (" + scanned + " scanned, " + fromCache +
                         " from cache), " + toolbarMods + " use the top toolbars (" + unnamed + " without official name), " +
                         imageCount + " image files, " + officialNames.Count + " official names received, " +
                         watch.ElapsedMilliseconds + " ms",
            };
        }

        /// <summary>
        /// Finds which toolbar mods contain each piece of component source code.
        /// Safe to run off the main thread, after <see cref="Build"/>.
        /// </summary>
        public static ProbeResult ResolveProbes(List<ModuleEntry> modules, List<Probe> probes)
        {
            var watch = Stopwatch.StartNew();
            var hits = new Dictionary<string, List<string>>();
            var loose = new HashSet<string>();
            foreach (var probe in probes)
            {
                hits[probe.id] = new List<string>();
            }

            // 1. Exact text: the code as the game runs it is the code in the file.
            var names = new List<string>();
            var texts = new List<string>();
            foreach (var module in modules)
            {
                if (!module.usesToolbar)
                {
                    continue;
                }

                var text = ReadModules(module);
                if (text.Length == 0)
                {
                    continue;
                }

                names.Add(module.moduleName);
                texts.Add(text);

                foreach (var probe in probes)
                {
                    if (text.IndexOf(probe.text, StringComparison.Ordinal) >= 0)
                    {
                        hits[probe.id].Add(module.moduleName);
                    }
                }
            }

            // 2. Some mods ship their code inside text literals (line breaks and quotes written as
            //    escapes), so the exact text is not in the file. For the probes still without an owner,
            //    compare only the characters that survive in both forms.
            var open = new List<Probe>();
            foreach (var probe in probes)
            {
                if (hits[probe.id].Count == 0)
                {
                    open.Add(probe);
                }
            }

            if (open.Count > 0)
            {
                var skeletons = new List<string>(open.Count);
                foreach (var probe in open)
                {
                    skeletons.Add(Skeleton(probe.text));
                }

                for (var m = 0; m < texts.Count; m++)
                {
                    var skeleton = Skeleton(texts[m]);
                    for (var p = 0; p < open.Count; p++)
                    {
                        if (skeletons[p].Length >= kMinSkeletonLength && skeleton.IndexOf(skeletons[p], StringComparison.Ordinal) >= 0)
                        {
                            hits[open[p].id].Add(names[m]);
                            loose.Add(open[p].id);
                        }
                    }
                }
            }

            foreach (var probe in probes)
            {
                var owners = hits[probe.id];
                var sample = probe.text.Length > 90 ? probe.text.Substring(0, 90) : probe.text;
                Log.Trace("Probe " + probe.id + " (" + probe.text.Length + " chars) -> " +
                          (owners.Count == 0 ? "no mod" : string.Join(", ", owners.ToArray())) +
                          (loose.Contains(probe.id) ? " (escaped code)" : string.Empty) + " | " +
                          sample.Replace('\r', ' ').Replace('\n', ' '));
            }

            watch.Stop();
            return new ProbeResult
            {
                hits = hits,
                report = "Probes: " + probes.Count + " searched in " + texts.Count + " mods (" + open.Count +
                         " also as escaped code), " + watch.ElapsedMilliseconds + " ms",
            };
        }

        /// <summary>
        /// Text without white space, quotes, backslashes and the escapes \n \r \t. Code stored inside a
        /// text literal and the same code as it runs give the same result.
        /// </summary>
        private static string Skeleton(string text)
        {
            var sb = new StringBuilder(text.Length);
            var length = text.Length;
            for (var i = 0; i < length; i++)
            {
                var c = text[i];
                if (c == '\\')
                {
                    if (i + 1 < length)
                    {
                        var next = text[i + 1];
                        if (next == 'n' || next == 'r' || next == 't')
                        {
                            i++;
                        }
                    }
                    continue;
                }

                if (c == '"' || c == '\'' || c == '`' || char.IsWhiteSpace(c))
                {
                    continue;
                }

                sb.Append(c);
            }
            return sb.ToString();
        }

        /// <summary>Serializes probe id -> UI module names for the UI.</summary>
        public static string HitsToJson(Dictionary<string, List<string>> hits)
        {
            var sb = new StringBuilder(1024);
            sb.Append('{');
            var first = true;
            foreach (var pair in hits)
            {
                if (!first)
                {
                    sb.Append(',');
                }
                first = false;

                AppendJsonString(sb, pair.Key);
                sb.Append(":[");
                for (var i = 0; i < pair.Value.Count; i++)
                {
                    if (i > 0)
                    {
                        sb.Append(',');
                    }
                    AppendJsonString(sb, pair.Value[i]);
                }
                sb.Append(']');
            }
            sb.Append('}');
            return sb.ToString();
        }

        /// <summary>
        /// Paradox Mods id from a folder path: the last folder named "digits_digits" gives the digits before
        /// the underscore (".../pdx_mods/92908_71/UI" gives "92908"). Empty when there is none.
        /// </summary>
        private static string ModIdFromPath(string directory)
        {
            var parts = directory.Split('\\', '/');
            for (var i = parts.Length - 1; i >= 0; i--)
            {
                var part = parts[i];
                var underscore = part.IndexOf('_');
                if (underscore <= 0 || underscore == part.Length - 1)
                {
                    continue;
                }

                var digits = true;
                for (var c = 0; c < part.Length; c++)
                {
                    if (c != underscore && !char.IsDigit(part[c]))
                    {
                        digits = false;
                        break;
                    }
                }

                if (digits)
                {
                    return part.Substring(0, underscore);
                }
            }

            return string.Empty;
        }

        private static void Scan(ModuleEntry module)
        {
            module.usesToolbar = false;
            module.moduleName = module.moduleNames.Count > 0 ? module.moduleNames[0] : string.Empty;
            module.images = new List<string>();

            for (var i = 0; i < module.modulePaths.Count; i++)
            {
                string text;
                try
                {
                    text = File.ReadAllText(module.modulePaths[i]);
                }
                catch (Exception e)
                {
                    Log.Trace("Index: unreadable " + module.modulePaths[i] + " (" + e.Message + ")");
                    continue;
                }

                foreach (var hook in kToolbarHooks)
                {
                    if (text.IndexOf(hook, StringComparison.Ordinal) >= 0)
                    {
                        module.usesToolbar = true;
                        module.moduleName = module.moduleNames[i];
                        break;
                    }
                }

                if (module.usesToolbar)
                {
                    break;
                }
            }

            if (!module.usesToolbar)
            {
                return;
            }

            try
            {
                CollectImages(module.directory, module.directory, 0, module.images);
            }
            catch (Exception e)
            {
                // An unreadable folder leaves the mod without icon data; its buttons rely on the component code.
                Log.Trace("Index: images not listed for " + module.directory + " (" + e.Message + ")");
            }
        }

        private static string ReadModules(ModuleEntry module)
        {
            var sb = new StringBuilder();
            foreach (var path in module.modulePaths)
            {
                try
                {
                    sb.Append(File.ReadAllText(path)).Append('\n');
                }
                catch (Exception e)
                {
                    Log.Trace("Probes: unreadable " + path + " (" + e.Message + ")");
                }
            }
            return sb.ToString();
        }

        private static void CollectImages(string root, string directory, int depth, List<string> files)
        {
            if (files.Count >= kMaxFilesPerMod)
            {
                return;
            }

            foreach (var file in Directory.GetFiles(directory))
            {
                var extension = Path.GetExtension(file).ToLowerInvariant();
                if (Array.IndexOf(kImageExtensions, extension) < 0)
                {
                    continue;
                }

                files.Add(file.Substring(root.Length).TrimStart('\\', '/').Replace('\\', '/').ToLowerInvariant());
                if (files.Count >= kMaxFilesPerMod)
                {
                    return;
                }
            }

            if (depth >= kMaxDepth)
            {
                return;
            }

            foreach (var sub in Directory.GetDirectories(directory))
            {
                var name = Path.GetFileName(sub);
                if (name.StartsWith(".", StringComparison.Ordinal))
                {
                    continue;
                }

                CollectImages(root, sub, depth + 1, files);
            }
        }

        private class CacheEntry
        {
            public string moduleName;
            public bool usesToolbar;
            public List<string> images = new List<string>();
        }

        // Cache file, one record per line, tab separated:
        //   D <1|0 uses toolbar> <UI module name> <folder>
        //   F <image path relative to the folder above>
        private static Dictionary<string, CacheEntry> ReadCache()
        {
            var cache = new Dictionary<string, CacheEntry>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (!File.Exists(CachePath))
                {
                    return cache;
                }

                var lines = File.ReadAllLines(CachePath, Encoding.UTF8);
                if (lines.Length == 0 || lines[0] != kCacheHeader)
                {
                    return cache;
                }

                CacheEntry current = null;
                for (var i = 1; i < lines.Length; i++)
                {
                    var line = lines[i];
                    if (line.StartsWith("D\t", StringComparison.Ordinal))
                    {
                        var parts = line.Split('\t');
                        if (parts.Length != 4)
                        {
                            current = null;
                            continue;
                        }

                        current = new CacheEntry { usesToolbar = parts[1] == "1", moduleName = parts[2] };
                        cache[parts[3]] = current;
                    }
                    else if (line.StartsWith("F\t", StringComparison.Ordinal) && current != null)
                    {
                        current.images.Add(line.Substring(2));
                    }
                }
            }
            catch (Exception e)
            {
                Log.Trace("Index: cache not read (" + e.Message + "); every folder is scanned");
                cache.Clear();
            }

            return cache;
        }

        private static void WriteCache(List<ModuleEntry> modules)
        {
            try
            {
                var sb = new StringBuilder(32 * 1024);
                sb.Append(kCacheHeader).Append('\n');
                foreach (var module in modules)
                {
                    if (module.isLocal)
                    {
                        continue;
                    }

                    sb.Append("D\t").Append(module.usesToolbar ? '1' : '0').Append('\t')
                      .Append(module.moduleName).Append('\t').Append(module.directory).Append('\n');
                    foreach (var image in module.images)
                    {
                        sb.Append("F\t").Append(image).Append('\n');
                    }
                }

                Directory.CreateDirectory(LayoutStore.DataDirectory);
                var temp = CachePath + ".tmp";
                File.WriteAllText(temp, sb.ToString(), new UTF8Encoding(false));
                if (File.Exists(CachePath))
                {
                    File.Delete(CachePath);
                }
                File.Move(temp, CachePath);
                Log.Trace("Index: cache written to " + CachePath);
            }
            catch (Exception e)
            {
                // The cache only saves time; without it the folders are scanned again on the next load.
                Log.Trace("Index: cache not written (" + e.Message + ")");
            }
        }

        private static void AppendJsonString(StringBuilder sb, string value)
        {
            sb.Append('"');
            if (value != null)
            {
                foreach (var c in value)
                {
                    switch (c)
                    {
                        case '"': sb.Append("\\\""); break;
                        case '\\': sb.Append("\\\\"); break;
                        case '\n': sb.Append("\\n"); break;
                        case '\r': sb.Append("\\r"); break;
                        case '\t': sb.Append("\\t"); break;
                        default:
                            if (c < ' ')
                            {
                                sb.Append("\\u").Append(((int)c).ToString("x4"));
                            }
                            else
                            {
                                sb.Append(c);
                            }
                            break;
                    }
                }
            }
            sb.Append('"');
        }
    }
}
