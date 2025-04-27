const { addonBuilder, serveHTTP, publishToCentral }  = require('stremio-addon-sdk');
const NodeCache = require('node-cache');
const axios = require('axios')
const { extractVidSrcStream0 } = require('./vidsrc-focused-extractor');
const PORT = process.env.PORT || 7000; // Use BeamUp's port

const manifest = new addonBuilder({
    id: 'org.stremio.vidsrc',
    version: '1.0.0',
    name: 'VidSrc',
    description: 'Watch movies and TV shows from VidSrc',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    logo: 'https://vidsrc.xyz/template/vidsrc-logo-light.svg',
    idPrefixes: ['tt']
});

// Setup cache to reduce load on VidSrc (cache for 2 hours)
const streamCache = new NodeCache({ stdTTL: 7200, checkperiod: 120 });

// Fetch movie data
async function fetchOmdbDetails(imdbId){
  try {
    const response = await axios.get(`https://www.omdbapi.com/?i=${imdbId}&apikey=b1e4f11`);
     if (response.data.Response === 'False') {
      throw new Error(response.data || 'Failed to fetch data from OMDB API');
     }
    return response.data;
  } catch (e) {
    console.log(`Error fetching metadata: ${e}`)
  }
}

// Main extraction function
async function extractStreamUrl(url) {
    try {
        return await extractVidSrcStream0(url);
    } catch (error) {
        console.log('Puppeteer extraction failed ', error.message);
    }
}

// Function to handle streams for movies
async function getMovieStreams(imdbId) {
    let finalStreams = [];
    const cacheKey = `movie:${imdbId}`;
    const metadata = await fetchOmdbDetails(imdbId);
    // Check cache first
    const cachedStreams = streamCache.get(cacheKey);
    if (cachedStreams) {
        console.log(`Using cached stream for movie ${imdbId}`);
        for (const stream in cachedStreams) {
            finalStreams.push({
                url: cachedStreams[stream],
                description: `${metadata['Title']} ${metadata['Year']} Stream`,
                name: stream
            });
        }
        return finalStreams;
    }

    const url = `https://vidsrc.xyz/embed/movie/${imdbId}`;
    try {
        const streamUrls = await extractStreamUrl(url);

        // Cache the result
        streamCache.set(cacheKey, streamUrls);
        if (streamUrls) {
            for (const stream in streamUrls) {
                finalStreams.push({
                    url: streamUrls[stream],
                    description: `${metadata['Title']} ${metadata['Year']} Stream`,
                    name: stream
                });
            }
        }
        return finalStreams;
    } catch (error) {
        console.error(`Error getting movie stream for ${metadata.title} :`, error.message);
        return [];
    }
}

// Function to handle streams for TV series
async function getSeriesStreams(imdbId, season, episode) {
    let finalStreams = [];
    const cacheKey = `series:${imdbId}:${season}:${episode}`;
    const metadata = await fetchOmdbDetails(imdbId);
    // Check cache first
    const cachedStream = streamCache.get(cacheKey);
    if (cachedStream) {
        console.log(`Using cached stream for series ${imdbId} S${season}E${episode}`);
        for (const stream in cachedStream) {
            finalStreams.push({
               url: cachedStream[stream],
               description: `${metadata['Title']} Season ${season}, Episode ${episode}`,
               name: stream
            });
        }
        return finalStreams;
    }

    const url = `https://vidsrc.xyz/embed/tv/${imdbId}/${season}-${episode}`;
    try {
        const streamUrls = await extractStreamUrl(url);

        // Cache the result
        streamCache.set(cacheKey, streamUrls);
        for (const stream in streamUrls) {
            finalStreams.push({
               url: streamUrls[stream],
               description: `${metadata['Title']} Season ${season}, Episode ${episode}`,
               name: stream
            });
        }

        return finalStreams;
    } catch (error) {
        console.error(`Error getting series stream for ${imdbId} S${season}E${episode}:`, error.message);
        return [];
    }
}

manifest.defineStreamHandler(async ({type, id}) => {
    console.log('Stream request:', type, id);
    try {
        if (type === 'movie') {
            // Movie IDs are in the format: tt1234567
            const imdbId = id.split(':')[0];
            const streams = await getMovieStreams(imdbId);
            console.log(streams);
            return Promise.resolve( { streams });
        } else if (type === 'series') {
            // Series IDs are in the format: tt1234567:1:1 (imdbId:season:episode)
            const parts = id.split(':');
            const imdbId = parts[0];
            const season = parts[1];
            const episode = parts[2];
            const streams = await getSeriesStreams(imdbId, season, episode);
            console.log(streams);
            return Promise.resolve({ streams });
        }

        return Promise.resolve({ streams: [] });
    } catch (error) {
        console.error('Error in stream handler:', error.message);
        return Promise.resolve({ streams: [] });
    }
});

serveHTTP(manifest.getInterface(), {port: PORT, hostname: "0.0.0.0"})
console.log(`Addon running on port ${PORT}`);