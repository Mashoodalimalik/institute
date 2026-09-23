from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

root = Path(SPECPATH).parent
a = Analysis([str(root / 'hardware' / 'entry.py')], pathex=[str(root / 'hardware' / 'src')],
             binaries=[], datas=[], hiddenimports=collect_submodules('uvicorn') + collect_submodules('zk'),
             hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='OkashaHardware', debug=False,
          strip=False, upx=False, console=True, icon=str(root / 'packaging' / 'okasha.ico'))
