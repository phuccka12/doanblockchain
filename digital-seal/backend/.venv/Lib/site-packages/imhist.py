import numpy as np

def imhist(image, PMF=False):
    hist, _ = np.histogram(image.copy().reshape(-1), bins=256, range=(0, 255))
    if PMF:
        size = np.prod(image.shape)
        hist = hist / size
    return hist
def imcdf(image):
    hist = imhist(image, PMF=True)
    cdf = np.cumsum(hist)
    return cdf
