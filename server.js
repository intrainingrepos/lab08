'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

// API Routes
app.get('/location', (request, response) => {
  console.log('location route hit');
  searchToLatLong(request.query.data)
    .then(location => { 
      console.log('this is our location', location);
     return response.send(location)
    })
    .catch(error => handleError(error, response));
})

app.get('/weather', getWeather);

app.get('/yelp', getRestaurant);

app.get('/movies', getMovies);

app.get('/meetups', getMeetups);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  // console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Yelp(restaurant) {
  this.name = restaurant.name;
  this.image_url = restaurant.image_url;
  this.price = restaurant.price;
  this.rating = restaurant.rating;
  this.url = restaurant.url;
}

function Movie(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.average_votes;
  this.total_votes = movie.total_votes;
  this.image_url = `http://image.tmdb.org/t/p/w185/${movie.poster_path}`;
  this.popularity = movie.popularity;
  this.released_on = movie.released_on;
}

function Meetups(meetups) {
  this.link = meetups.link;
  this.name = meetups.name;
  this.host = meetups.host;
  this.creation_date = meetups.creation_date;
}

// Helper Functions
function searchToLatLong(query) {
  console.log('this is our query', query);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  console.log('this is the url', url);
  return superagent.get(url)
    .then((res) => {
      return new Location(query, res);
    })
    .catch(error => handleError(error));
}

function getWeather(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  superagent.get(url)
    .then((result) => {
      const weatherSummaries = result.body.daily.data.map(day => {
        return new Weather(day);
      });
      // console.log('this is the weather', weatherSummaries);

      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

function getRestaurant(request, response) { 
  console.log('restaurant function called')
  const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;
  superagent.get(url)
            .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
            .then((yelp_API_response) =>  { 
              console.log('getting stuff');
              const yelpSummaries = yelp_API_response.body.businesses.map(restaurant => {
                return new Yelp(restaurant);
              });
              console.log('new rest', yelp_API_response);
              response.send(yelpSummaries);
              console.log('summaries', yelpSummaries);
            })
            .catch(error => handleError(error, response));
}

function getMovies(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?query=${request.query.data.search_query}&api_key=${process.env.MOVIEDB_API_KEY}`
	superagent.get(url)
	          .then(result => {
		          const movieSummaries = result.body.results.map( movie => {
			          return new Movie(movie);
              });
              console.log('see movies', result);
	            response.send(movieSummaries);
	          })
	          .catch(error => handleError(error, response));
}

function getMeetups(request, response) {
  const url = 
}