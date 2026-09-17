# 리포지토리 기준 경로로 동작한다. 실행: python tools/<이 파일>
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import numpy as np, os
SRC = os.path.join(ROOT, 'assets/source/animals-battlebeasts.png')
OUT = os.path.join(ROOT, 'docs/design/pieces-x')
os.makedirs(OUT,exist_ok=True)
COLS=[(60,348),(395,684),(729,1016),(1063,1348)]
ROWS=[(63,352),(415,707)]
NAMES=[["lion","tiger","rooster","chick-a"],["elephant","chick-b","giraffe-a","giraffe-b"]]
BG,INK=250.0,40.0
PAD,SIZE=0.05,320
KEEP_INSET,KEEP_R=10,44
im=Image.open(SRC).convert('RGB')
lum=np.asarray(im).astype(np.float32).mean(axis=2)
for r,(y0,y1) in enumerate(ROWS):
    for c,(x0,x1) in enumerate(COLS):
        name=NAMES[r][c]
        sub=lum[y0:y1+1,x0:x1+1]; h0,w0=sub.shape
        keep=Image.new('L',(w0,h0),0)
        ImageDraw.Draw(keep).rounded_rectangle([KEEP_INSET,KEEP_INSET,w0-1-KEEP_INSET,h0-1-KEEP_INSET],radius=KEEP_R,fill=255)
        keep=np.asarray(keep).astype(np.float32)/255.0
        alpha=np.clip((BG-sub)/(BG-INK),0,1)*keep
        alpha[alpha<0.05]=0
        ys,xs=np.nonzero(alpha>0.30)
        bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max()
        art=alpha[by0:by1+1,bx0:bx1+1]; h,w=art.shape
        side=int(max(h,w)*(1+2*PAD))
        cv=np.zeros((side,side),np.float32); oy,ox=(side-h)//2,(side-w)//2
        cv[oy:oy+h,ox:ox+w]=art
        a8=Image.fromarray((cv*255).astype(np.uint8),'L').resize((SIZE,SIZE),Image.LANCZOS)
        Image.merge('LA',(Image.new('L',(SIZE,SIZE),0),a8)).save(os.path.join(OUT,f"{name}.png"),optimize=True)
        print(f"{name:10s} {w}x{h}  cov {float((art>0.3).mean())*100:.0f}%")
