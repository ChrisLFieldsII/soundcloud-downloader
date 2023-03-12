// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import puppeteer, { Page } from 'puppeteer';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';

type Data = any;

const DEFAULT_TIMEOUT = 1000 * 10;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
) {
  const link = req.query.link as string;
  if (!link) {
    throw new Error('provide `link` query param');
  }

  // go to soundcloud
  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();
  await page.goto(link, {
    waitUntil: 'networkidle0',
  });

  // get album cover url and download image
  const coverUrl = await page.$$eval(
    'span[aria-role=img]',
    async (elements) => {
      // get url from cover image element background style. ex: url("https://i1.sndcdn.com/artworks-000636328306-jx14j6-t500x500.jpg")
      function parseCoverUrl(url: string) {
        return url.replace('url(', '').replace(')', '').replaceAll('"', '');
      }

      const element = elements[0]; // it seems to always be the first element
      return parseCoverUrl(element.style.backgroundImage);
    },
  );

  const album = (() => {
    const paths = link.split('/');
    return paths[paths.length - 1];
  })();
  const basePath = process.env.HOME || process.env.USERPROFILE || '.'; // HOME (mac), USERPROFILE (windows)
  const downloadPath = join(basePath, 'Downloads', `album-${album}`);
  const coverData = await (await fetch(coverUrl)).arrayBuffer();
  try {
    // save album cover image to fs
    await mkdir(downloadPath);
    await writeFile(join(downloadPath, 'cover.jpg'), Buffer.from(coverData));
  } catch (error) {
    console.error('failed to save album cover image');
  }

  // scroll page to bottom (songs load as scroll)
  await autoScroll(page);

  // collect song urls
  const urls = await page.$$eval(
    'a.trackItem__trackTitle',
    async (elements) => {
      return elements.map((e) => e.href);
    },
  );
  console.log(`processing ${urls.length} urls`);

  if (!urls.length) {
    throw new Error('no urls found');
  }

  // go to soundcloud to mp3 converter site
  await page.goto('https://www.soundcloudme.com/', {
    waitUntil: 'networkidle0',
    timeout: DEFAULT_TIMEOUT,
  });

  // enter song urls into converter
  for (let x = 0; x < urls.length; x++) {
    const url = urls[x];

    console.log(`${x + 1}: processing url ${url}`);

    const input = await page.$('input[type=text]');
    if (!input) {
      throw new Error('no input found');
    }
    await input.type(urls[x]);

    const submitBtn = await page.$('button[type=submit]');
    if (!submitBtn) {
      throw new Error('no submit btn found');
    }
    await submitBtn.click();

    await page.waitForNavigation({ timeout: DEFAULT_TIMEOUT });

    // at the download page
    const downloadBtn = await page.$('button[type=submit]');
    if (!downloadBtn) {
      throw new Error('no download btn found');
    }
    await downloadBtn.click();

    const downloadAnotherBtn = await page.$(
      'a[href="https://www.soundcloudme.com"]',
    );
    if (!downloadAnotherBtn) {
      throw new Error('no download another btn found');
    }
    await downloadAnotherBtn.click();
    await page.waitForNavigation({ timeout: DEFAULT_TIMEOUT });
  }

  await browser.close();
  console.log('done!');

  res.status(200).json({ urls, count: urls.length });
}

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve(undefined);
        }
      }, 1000 * 1);
    });
  });
}
