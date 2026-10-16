# Rebuilds OneJump.xcodeproj/project.pbxproj from the files in mobile-app/OneJump (Xcode 14/15
# format, explicit groups). Build settings are kept as they are. Usage: python3 genproj.py mobile-app
import os, re, sys, hashlib
root = sys.argv[1]  # mobile-app dir
pbx = os.path.join(root, "OneJump.xcodeproj/project.pbxproj")
old = open(pbx).read()
# keep the XCBuildConfiguration + XCConfigurationList sections as they are
cfg = old[old.index("/* Begin XCBuildConfiguration section */"):old.index("/* End XCConfigurationList section */")+len("/* End XCConfigurationList section */")]

def uid(s):
    return hashlib.md5(s.encode()).hexdigest()[:24].upper()

src = os.path.join(root, "OneJump")
TYPES = {".swift":"sourcecode.swift", ".ttf":"file", ".txt":"text", ".xcassets":"folder.assetcatalog", ".xcprivacy":"text.xml"}
groups = {}   # relpath -> (id, children ids)
files = []    # (id, buildid, name, type, kind)
def walk(rel):
    gid = uid("group:"+rel)
    children = []
    full = os.path.join(src, rel) if rel else src
    for name in sorted(os.listdir(full), key=lambda n:(not os.path.isdir(os.path.join(full,n)) or n.endswith(".xcassets"), n.lower())):
        if name.startswith("."): continue
        p = os.path.join(full, name); r = os.path.join(rel, name) if rel else name
        if os.path.isdir(p) and not name.endswith(".xcassets"):
            children.append(walk(r))
        else:
            ext = ".xcassets" if name.endswith(".xcassets") else os.path.splitext(name)[1]
            t = TYPES[ext]
            fid, bid = uid("file:"+r), uid("build:"+r)
            kind = "src" if ext == ".swift" else "res"
            files.append((fid, bid, name, t, kind))
            children.append(fid)
    groups[rel] = (gid, children, os.path.basename(rel) or "OneJump")
    return gid
walk("")

L = []
w = L.append
w("// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {\n\t};\n\tobjectVersion = 56;\n\tobjects = {\n")
w("/* Begin PBXBuildFile section */")
for fid,bid,name,t,kind in files:
    w(f"\t\t{bid} /* {name} in {'Sources' if kind=='src' else 'Resources'} */ = {{isa = PBXBuildFile; fileRef = {fid} /* {name} */; }};")
w("/* End PBXBuildFile section */\n")
w("/* Begin PBXFileReference section */")
w("\t\t0E1A00000000000000000001 /* OneJump.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = OneJump.app; sourceTree = BUILT_PRODUCTS_DIR; };")
for fid,bid,name,t,kind in files:
    q = f'"{name}"' if re.search(r"[^A-Za-z0-9_./]", name) else name
    w(f"\t\t{fid} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = {t}; path = {q}; sourceTree = \"<group>\"; }};")
w("/* End PBXFileReference section */\n")
w("""/* Begin PBXFrameworksBuildPhase section */
		0E1A00000000000000000003 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXFrameworksBuildPhase section */
""")
w("/* Begin PBXGroup section */")
names = {fid:name for fid,_,name,_,_ in files}
for rel,(gid,ch,name) in groups.items(): names[gid]=name
w("\t\t0E1A00000000000000000004 = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t%s /* OneJump */,\n\t\t\t\t0E1A00000000000000000005 /* Products */,\n\t\t\t);\n\t\t\tsourceTree = \"<group>\";\n\t\t};" % groups[""][0])
w("\t\t0E1A00000000000000000005 /* Products */ = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t0E1A00000000000000000001 /* OneJump.app */,\n\t\t\t);\n\t\t\tname = Products;\n\t\t\tsourceTree = \"<group>\";\n\t\t};")
for rel,(gid,ch,name) in sorted(groups.items()):
    kids = "".join(f"\t\t\t\t{c} /* {names[c]} */,\n" for c in ch)
    w(f"\t\t{gid} /* {name} */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n{kids}\t\t\t);\n\t\t\tpath = {name};\n\t\t\tsourceTree = \"<group>\";\n\t\t}};")
w("/* End PBXGroup section */\n")
w("""/* Begin PBXNativeTarget section */
		0E1A00000000000000000006 /* OneJump */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 0E1A0000000000000000000A /* Build configuration list for PBXNativeTarget "OneJump" */;
			buildPhases = (
				0E1A00000000000000000007 /* Sources */,
				0E1A00000000000000000003 /* Frameworks */,
				0E1A00000000000000000008 /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = OneJump;
			productName = OneJump;
			productReference = 0E1A00000000000000000001 /* OneJump.app */;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		0E1A00000000000000000009 /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1500;
				LastUpgradeCheck = 1500;
				TargetAttributes = {
					0E1A00000000000000000006 = {
						CreatedOnToolsVersion = 15.0;
					};
				};
			};
			buildConfigurationList = 0E1A0000000000000000000B /* Build configuration list for PBXProject "OneJump" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				es,
				Base,
			);
			mainGroup = 0E1A00000000000000000004;
			productRefGroup = 0E1A00000000000000000005 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				0E1A00000000000000000006 /* OneJump */,
			);
		};
/* End PBXProject section */
""")
def phase(pid, label, isa, kind):
    fs = "".join(f"\t\t\t\t{bid} /* {name} in {label} */,\n" for fid,bid,name,t,k in files if k==kind)
    return f"/* Begin {isa} section */\n\t\t{pid} /* {label} */ = {{\n\t\t\tisa = {isa};\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n{fs}\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n/* End {isa} section */\n"
w(phase("0E1A00000000000000000008","Resources","PBXResourcesBuildPhase","res"))
w(phase("0E1A00000000000000000007","Sources","PBXSourcesBuildPhase","src"))
w(cfg)
w("\t};\n\trootObject = 0E1A00000000000000000009 /* Project object */;\n}\n")
open(pbx,"w").write("\n".join(L))
print(len(files), "files,", len(groups), "groups")
