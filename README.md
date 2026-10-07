# Pharos Retinal Screening

## Live demo

Site: https://meganmenezes.github.io/pharos-demo/

QR image: [assets/pharos-qr.png](assets/pharos-qr.png)

A static, mobile-first retinal screening experience. It uses the browser camera for an on-device alignment and recording simulation; the captured photo stays temporarily in memory and is not uploaded or saved. Each review shows six distinct ACRIMA images, including `img18` as the selected sample with its paired 23% placeholder risk. Other ACRIMA images are randomized for each review. The risk and sample metrics are illustrative only, not calculated from the camera photo; the Pharos model is not run.

## Prepare the sample data

Requires Python and Pillow:

```powershell
python -m pip install Pillow
python prep_data.py
```

The script reads `ACRIMA-Dataset.zip` directly, writes 30 resized images to `assets/fundus/`, and generates `data/results.json`. It does not extract the complete dataset.

## Preview locally

Open this folder in VS Code and use the Live Server extension on `index.html`. The demo fetches its JSON data, so serve it over HTTP rather than opening the HTML file directly.

## Deploy to GitHub Pages

Push the project to a GitHub repository, then open **Settings → Pages**. Choose **Deploy from a branch**, select the branch and `/ (root)` folder, and save. Once Pages publishes the site, open its URL on a phone to test the full flow.

To make a QR code, enter the published Pages URL into a QR-code generator, download the code, and test it with a phone camera before printing or sharing it.
