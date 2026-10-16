#!/usr/bin/env python3
"""Checks the integrity of the iOS project file without Xcode.

Swift source files are added to the Xcode project by hand, so this script confirms that the
references in the project file are consistent: every Swift source file has a file reference,
appears in a group and is in the compile sources phase; Info.plist and the storyboards parse
and contain the configuration needed for the WhatsApp integration and file associations.
"""

import json
import plistlib
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "native" / "ios" / "App"
failures: list[str] = []


def check(condition: bool, message: str) -> None:
    print(("ok    " if condition else "FAIL  ") + message)
    if not condition:
        failures.append(message)


project = (APP / "App.xcodeproj" / "project.pbxproj").read_text()
check(project.count("{") == project.count("}") and project.count("(") == project.count(")"), "project.pbxproj has balanced braces and parentheses")

file_refs = dict(re.findall(r"^\t\t(\w{24}) /\* (.+?) \*/ = \{isa = PBXFileReference;", project, re.M))
build_files = re.findall(r"^\t\t(\w{24}) /\* (.+?) in (\w+) \*/ = \{isa = PBXBuildFile; fileRef = (\w{24})", project, re.M)
identifiers = [identifier for identifier, _ in re.findall(r"^\t\t(\w{24}) /\* (.+?) \*/ = \{", project, re.M)]
check(len(identifiers) == len(set(identifiers)), "object identifiers are unique")

# The Xcode project can't read package.json, so scripts/sync-version.mjs copies the version into it.
package_version = json.loads((ROOT / "package.json").read_text())["version"].split("-")[0]
marketing_versions = set(re.findall(r"MARKETING_VERSION = ([^;]+);", project))
check(marketing_versions == {package_version}, f"the Xcode project version matches package.json {package_version} (run node scripts/sync-version.mjs)")
# Localized resources (the two storyboards) are variant groups in the project, not plain file references.
variant_groups = set(re.findall(r"^\t\t(\w{24}) /\* .+? \*/ = \{\s*isa = PBXVariantGroup;", project, re.M))
check(all(ref in file_refs or ref in variant_groups for _, _, _, ref in build_files), "every build file points to an existing file reference or variant group")

sources_match = re.search(r"isa = PBXSourcesBuildPhase;.*?files = \((.*?)\);", project, re.S)
check(sources_match is not None, "project.pbxproj has a sources build phase")
sources_phase = sources_match.group(1) if sources_match else ""
swift_files = sorted(path.name for path in (APP / "App").glob("*.swift"))
for name in swift_files:
    refs = [identifier for identifier, file_name in file_refs.items() if file_name == name]
    builds = [identifier for identifier, file_name, phase, _ in build_files if file_name == name and phase == "Sources"]
    in_group = bool(refs) and re.search(rf"children = \([^)]*{refs[0]} /\* {re.escape(name)} \*/", project, re.S) is not None
    in_sources = bool(builds) and builds[0] in sources_phase
    check(len(refs) == 1 and len(builds) == 1 and in_group and in_sources, f"{name} is referenced, grouped and compiled")

with (APP / "App" / "Info.plist").open("rb") as handle:
    info = plistlib.load(handle)

check("whatsapp" in info.get("LSApplicationQueriesSchemes", []), "Info.plist allows querying the whatsapp URL scheme")
# The web view reports the language iOS picks among the app's declared localizations, not the system language itself: without
# Chinese declared here, a Chinese system would get English on first launch (src/i18n.ts follows navigator.language).
check({"en", "zh-Hans"} <= set(info.get("CFBundleLocalizations", [])), "Info.plist declares the English and Chinese localizations of the UI")
check(bool(info.get("NSCameraUsageDescription")) and bool(info.get("NSPhotoLibraryUsageDescription")), "Info.plist has camera and photo library usage descriptions")
exported = {item["UTTypeIdentifier"]: item for item in info.get("UTExportedTypeDeclarations", [])}
handled = [identifier for document in info.get("CFBundleDocumentTypes", []) for identifier in document["LSItemContentTypes"]]
check(all(identifier in exported for identifier in handled) and bool(handled), "every handled document type is declared")
check(any("wastickers" in item["UTTypeTagSpecification"]["public.filename-extension"] for item in exported.values()), "the .wastickers extension is registered")

storyboard = ET.parse(APP / "App" / "Base.lproj" / "Main.storyboard").getroot()
controller = storyboard.find(".//viewController")
source = (APP / "App" / "MainViewController.swift").read_text()
check(controller is not None and controller.get("customClass") == "MainViewController" and "class MainViewController: CAPBridgeViewController" in source, "the storyboard's view controller class exists in the sources")
check("MainViewController()" in (APP / "App" / "SceneDelegate.swift").read_text(), "the scene delegate creates the view controller that registers the plugin")

plugin = (APP / "App" / "StickerBridgePlugin.swift").read_text()
declared = set(re.findall(r'CAPPluginMethod\(name: "(\w+)"', plugin))
implemented = set(re.findall(r"@objc func (\w+)\(_ call: CAPPluginCall\)", plugin))
web = (ROOT / "src" / "lib" / "native.ts").read_text()
interface_parts = web.split("export interface StickerBridgePlugin {")
check(len(interface_parts) == 2, "native.ts declares the StickerBridgePlugin interface")
interface_body = interface_parts[1].split("\n}")[0] if len(interface_parts) == 2 else ""
interface = set(re.findall(r"^  (\w+)\(", interface_body, re.M)) - {"addListener"}
check(declared == implemented, "every declared plugin method is implemented in Swift")
check(declared == interface, "the Swift plugin implements exactly the methods of the TypeScript interface")

sys.exit(1 if failures else 0)
