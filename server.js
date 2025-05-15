const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { URL } = require('url'); // Node.js built-in module for URL parsing

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('SEO Analyzer Backend is running!');
});

// Helper function to validate URL
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

// Helper function to fetch content and measure time
const fetchUrl = async (url) => {
  const startTime = Date.now();
  const response = await axios.get(url, { timeout: 10000 }); // 10 second timeout
  const endTime = Date.now();
  const fetchTime = endTime - startTime;
  return { data: response.data, fetchTime, status: response.status };
};

// Helper function to check for specific status codes (e.g., 200 for robots/sitemap)
const checkUrlExists = async (url) => {
    try {
        const response = await axios.head(url, { timeout: 5000 }); // Use HEAD request for efficiency
        return response.status === 200;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return false; // 404 explicitly means not found
        }
        console.error(`Error checking existence of ${url}: ${error.message}`);
        return false; // Treat other errors as not found or unable to verify
    }
};


app.post('/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.' });
  }

  console.log(`Analyzing URL: ${url}`);

  const analysisResult = {
    url: url,
    score: 0,
    report: {},
    recommendations: []
  };

  let htmlContent = null;
  let $; // Cheerio instance
  let pageLoadTime = 'N/A'; // Measured fetch time

  try {
    // 1. Fetch the main page and measure time
    const { data, fetchTime, status } = await fetchUrl(url);
    htmlContent = data;
    $ = cheerio.load(htmlContent);
    pageLoadTime = `${fetchTime}ms`;
    analysisResult.report.pageLoadTime = {
      status: fetchTime < 1000 ? 'Pass' : (fetchTime < 3000 ? 'Warning' : 'Fail'), // Simple threshold
      details: `Fetched in ${pageLoadTime} (HTTP Status: ${status})`
    };
     if (status !== 200) {
        analysisResult.report.pageLoadTime.status = 'Fail';
        analysisResult.recommendations.push(`The page returned an HTTP status code of ${status}. Ensure your page is accessible and returns a 200 OK status.`);
    }

  } catch (error) {
    console.error(`Error fetching main page ${url}:`, error.message);
    analysisResult.report.pageLoadTime = {
        status: 'Fail',
        details: `Failed to fetch page: ${error.message}`
    };
     analysisResult.recommendations.push(`Could not fetch the page at ${url}. Check the URL for typos and ensure the server is accessible.`);
  }

  // Only proceed with HTML parsing checks if fetching was successful
  if (htmlContent) {
      // 2. Meta Title Check
      const title = $('head title').text();
      const titleLength = title.length;
      const titleMinLength = 30; // Example recommended minimum length
      const titleMaxLength = 60; // Example recommended maximum length

      analysisResult.report.metaTitle = {
          content: title,
          length: titleLength
      };

      if (!title) {
          analysisResult.report.metaTitle.status = 'Fail';
          analysisResult.report.metaTitle.details = 'Meta Title is missing or empty.';
          analysisResult.recommendations.push('Add a descriptive meta title to your page.');
      } else if (titleLength < titleMinLength || titleLength > titleMaxLength) {
           analysisResult.report.metaTitle.status = 'Warning';
           analysisResult.report.metaTitle.details = `Meta Title is ${titleLength} characters long. Recommended length is ${titleMinLength}-${titleMaxLength} characters.`;
           analysisResult.recommendations.push(`Adjust the length of your meta title to be between ${titleMinLength} and ${titleMaxLength} characters.`);
      } else {
          analysisResult.report.metaTitle.status = 'Pass';
          analysisResult.report.metaTitle.details = `Meta Title found: "${title}" (${titleLength} characters).`;
      }

      // 3. Meta Description Check
      const metaDescription = $('head meta[name="description"]').attr('content');
      const descriptionLength = metaDescription ? metaDescription.length : 0;
      const descriptionMinLength = 120; // Example recommended minimum length
      const descriptionMaxLength = 160; // Example recommended maximum length

      analysisResult.report.metaDescription = {
          content: metaDescription,
          length: descriptionLength
      };

      if (!metaDescription) {
          analysisResult.report.metaDescription.status = 'Fail';
          analysisResult.report.metaDescription.details = 'Meta Description is missing or empty.';
          analysisResult.recommendations.push('Add a compelling meta description to your page.');
      } else if (descriptionLength < descriptionMinLength || descriptionLength > descriptionMaxLength) {
           analysisResult.report.metaDescription.status = 'Warning';
           analysisResult.report.metaDescription.details = `Meta Description is ${descriptionLength} characters long. Recommended length is ${descriptionMinLength}-${descriptionMaxLength} characters.`;
           analysisResult.recommendations.push(`Adjust the length of your meta description to be between ${descriptionMinLength} and ${descriptionMaxLength} characters.`);
      } else {
          analysisResult.report.metaDescription.status = 'Pass';
          analysisResult.report.metaDescription.details = `Meta Description found: "${metaDescription}" (${descriptionLength} characters).`;
      }

      // 4. Basic Mobile-Friendliness Check (Viewport Meta Tag)
       const viewportMetaTag = $('head meta[name="viewport"]').attr('content');
       analysisResult.report.mobileFriendly = {}; // Initialize

       if (viewportMetaTag) {
           analysisResult.report.mobileFriendly.status = 'Pass';
           analysisResult.report.mobileFriendly.details = 'Viewport meta tag found.';
       } else {
           analysisResult.report.mobileFriendly.status = 'Warning';
           analysisResult.report.mobileFriendly.details = 'Viewport meta tag missing. This is a basic check; consider a full mobile-friendly test.';
           analysisResult.recommendations.push('Add a viewport meta tag (e.g., <meta name="viewport" content="width=device-width, initial-scale=1.0">) for better mobile rendering.');
       }
  } else {
      // If HTML fetch failed, mark all HTML-dependent checks as failed
      analysisResult.report.metaTitle = { status: 'Fail', details: 'Could not retrieve page content.' };
      analysisResult.report.metaDescription = { status: 'Fail', details: 'Could not retrieve page content.' };
      analysisResult.report.mobileFriendly = { status: 'Fail', details: 'Could not retrieve page content.' };
  }


  // 5. Robots.txt Existence Check
  try {
      const parsedUrl = new URL(url);
      const robotsTxtUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
      const robotsTxtExists = await checkUrlExists(robotsTxtUrl);

      analysisResult.report.robotsTxt = {}; // Initialize
      if (robotsTxtExists) {
          analysisResult.report.robotsTxt.status = 'Pass';
          analysisResult.report.robotsTxt.details = `robots.txt found at ${robotsTxtUrl}`;
      } else {
          analysisResult.report.robotsTxt.status = 'Warning'; // Warning because not having one is not always bad, but good practice
          analysisResult.report.robotsTxt.details = `robots.txt not found at ${robotsTxtUrl}`;
          analysisResult.recommendations.push('Consider creating a robots.txt file to guide search engine crawlers.');
      }
  } catch (error) {
       console.error(`Error checking robots.txt for ${url}:`, error.message);
       analysisResult.report.robotsTxt = {
           status: 'Fail',
           details: `Failed to check robots.txt: ${error.message}`
       };
       analysisResult.recommendations.push('Could not check for robots.txt. Ensure the domain is accessible.');
  }


  // 6. Sitemap.xml Existence Check (Basic - checks common location)
   try {
      const parsedUrl = new URL(url);
      const sitemapXmlUrl = `${parsedUrl.protocol}//${parsedUrl.host}/sitemap.xml`;
      const sitemapExists = await checkUrlExists(sitemapXmlUrl);

       analysisResult.report.sitemapXml = {}; // Initialize
      if (sitemapExists) {
          analysisResult.report.sitemapXml.status = 'Pass';
          analysisResult.report.sitemapXml.details = `sitemap.xml found at ${sitemapXmlUrl}`;
      } else {
          analysisResult.report.sitemapXml.status = 'Fail'; // Failure is appropriate as it's important for indexation
          analysisResult.report.sitemapXml.details = `sitemap.xml not found at ${sitemapXmlUrl}. (Checked common location)`;
          analysisResult.recommendations.push('Create an XML sitemap and submit it to search engines like Google and Bing.');
      }
  } catch (error) {
       console.error(`Error checking sitemap.xml for ${url}:`, error.message);
        analysisResult.report.sitemapXml = {
           status: 'Fail',
           details: `Failed to check sitemap.xml: ${error.message}`
       };
       analysisResult.recommendations.push('Could not check for sitemap.xml. Ensure the domain is accessible.');
  }


  // 7. Simple Scoring 
  let score = 0;
  let maxPossibleScore = 0; // Calculate max possible points for normalization

  // Define points for each check
  const pointsConfig = {
      pageLoadTime: { Pass: 15, Warning: 5, Fail: 0 },
      metaTitle: { Pass: 10, Warning: 3, Fail: 0 },
      metaDescription: { Pass: 10, Warning: 3, Fail: 0 },
      mobileFriendly: { Pass: 5, Warning: 1, Fail: 0 },
      robotsTxt: { Pass: 5, Warning: 2, Fail: 0 }, // Slightly less penalty for warning
      sitemapXml: { Pass: 5, Warning: 0, Fail: 0 } // Fail gets 0 for sitemap
  };

  // Calculate score based on report status
  for (const check in analysisResult.report) {
      const status = analysisResult.report[check].status;
      if (pointsConfig[check] && pointsConfig[check][status] !== undefined) {
          score += pointsConfig[check][status];
      }
      // Add the maximum possible points for this check to the total
       if (pointsConfig[check] && pointsConfig[check].Pass !== undefined) {
         maxPossibleScore += pointsConfig[check].Pass;
       }
  }

  // Normalize score to 0-100 (avoid division by zero if no checks are done)
  analysisResult.score = maxPossibleScore > 0 ? Math.round((score / maxPossibleScore) * 100) : 0;


  // Send the final analysis result
  res.json(analysisResult);

});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});