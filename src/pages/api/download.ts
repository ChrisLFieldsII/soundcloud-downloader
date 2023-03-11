// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import puppeteer, { Page } from 'puppeteer';

type Data = any;

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

    await page.waitForNavigation();

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
    await page.waitForNavigation();
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
