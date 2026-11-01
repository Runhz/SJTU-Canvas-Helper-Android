"""Compile the approved ribbon mark into repo-native and Android icon resources."""
from pathlib import Path
import hashlib,json,shutil,subprocess

root=Path(__file__).resolve().parents[1]
brand=root/'assets/branding'
brand.mkdir(parents=True,exist_ok=True)
source=Path('C:/Users/asd/.codex/generated_images/01a13cdf-497d-7dc1-883c-b9f48157e959/exec-238817f0-2c98-40e0-92a8-28579cee9461.png')
if not (brand/'approved-concept.png').exists():shutil.copyfile(source,brand/'approved-concept.png')

# Curves follow the selected concept's contour, including its fine connecting strip.
path='M665 324 C676 317 686 328 686 348 L686 471 C686 487 689 496 703 504 L860 585 C904 607 924 631 924 670 L924 750 C924 788 905 815 869 831 L583 931 C552 945 529 933 529 897 L529 817 C529 801 530 790 537 776 L376 703 C345 690 331 677 331 650 L331 518 C330 483 350 457 382 442 Z M686 500 C686 514 676 519 657 527 L397 638 C374 649 361 661 362 671 C363 684 376 694 393 701 L537 774 C550 751 568 738 599 725 L777 659 L728 636 C701 622 690 604 689 576 Z'
mark=f'<path fill="#FAF8F1" fill-rule="evenodd" d="{path}"/>'
foreground=f'<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254">{mark}</svg>\n'
tile=f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="178 178 898 898"><rect x="178" y="178" width="898" height="898" rx="200" fill="#101C31"/>{mark}</svg>\n'
(brand/'ribbon-foreground.svg').write_text(foreground,encoding='utf-8')
(brand/'app-icon.svg').write_text(tile,encoding='utf-8')
shutil.copyfile(brand/'app-icon.svg',root/'demo/public/app-icon.svg')
manifest={'default':'app-icon.svg','bg_color':'#101C31','android_fg':'ribbon-foreground.svg','android_fg_scale':100,'android_monochrome':'ribbon-foreground.svg'}
(brand/'icon-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
generated=root/'local-diagnostics/approved-icon-compiled'
cli=root/'demo/node_modules/.bin/tauri.cmd'
subprocess.run([str(cli),'icon',str(brand/'icon-manifest.json'),'-o',str(generated)],cwd=root,check=True)
res=root/'src-tauri/gen/android/app/src/main/res'
for folder in ['mipmap-mdpi','mipmap-hdpi','mipmap-xhdpi','mipmap-xxhdpi','mipmap-xxxhdpi']:
    for file in (generated/'android'/folder).glob('*.png'):
        shutil.copyfile(file,res/folder/file.name)

# Native vector layers keep Android 13 themed icons clean at all densities.
for name in ['ic_canvas_ribbon','ic_canvas_monochrome']:
    vector=f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="1254" android:viewportHeight="1254"><path android:fillColor="#FAF8F1" android:fillType="evenOdd" android:pathData="{path}"/></vector>\n'
    (res/'drawable'/f'{name}.xml').write_text(vector,encoding='utf-8')
for folder in ['mipmap-anydpi-v26','mipmap-anydpi-v33']:
    for name in ['ic_launcher','ic_launcher_round']:
        mono='<monochrome android:drawable="@drawable/ic_canvas_monochrome"/>' if folder.endswith('v33') else ''
        xml='<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/canvas_icon_background"/><foreground android:drawable="@drawable/ic_canvas_ribbon"/>'+mono+'</adaptive-icon>\n'
        (res/folder/f'{name}.xml').write_text(xml,encoding='utf-8')

print(json.dumps({'approvedConceptSha256':hashlib.sha256((brand/'approved-concept.png').read_bytes()).hexdigest(),'adaptiveForeground':'ic_canvas_ribbon','source':str(brand/'app-icon.svg')},indent=2))
