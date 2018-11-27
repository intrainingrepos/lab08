'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

// Database configuration 
const client = new pg.Client(process.env.DATABASE_URL);
// DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/city_explorer
client.connect();
client.on ('error', err => console.error(err));

// API Routes
app.get('/location', getLocation);
 
app.get('/weather', getWeather);

app.get('/yelp', getRestaurant);

app.get('/movies', getMovies);

app.get('/meetups', getMeetups);

app.get('/trails', getTrails);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  // console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.tableName = 'locations';
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.created_at = Date.now();
}

Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];

  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('We have a match for location');
        location.cacheHit(result);
      } else {
        console.log('We do not have a location match');
        location.cacheMiss();
      }
    })
    .catch(console.error);
}

// Location.prototype.save = function() and so on
Location.prototype = {
  save: function () {
    const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];

    return client.query(SQL, values)
      .then(result => {
        this.id = result.rows[0].id;
        return this;
      });
  }
};

function Weather(day) {
  this.tableName = 'weathers';
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;
Weather.deleteByLocationId = deleteByLocationId;

Weather.prototype = {
  save: function (location_id) {
    const SQL = `INSERT INTO ${this.tableName} (forecast, time, created_at, location_id) VALUES ($1, $2, $3, $4);`;
    const values = [this.forecast, this.time, this.created_at, location_id];

    client.query(SQL, values);
  }
}

function Yelp(restaurant) {
  this.tableName = 'restaurants';
  this.name = restaurant.name;
  this.image_url = restaurant.image_url;
  this.price = restaurant.price;
  this.rating = restaurant.rating;
  this.url = restaurant.url;
  this.created_at = Date.now();
}

Yelp.tableName = 'restaurants';
Yelp.lookup = lookup;
Yelp.deleteByLocationId = deleteByLocationId

Yelp.prototype = {
  save: function (location_id) {
    const SQL = `INSERT INTO ${this.tableName} (name, image_url,  price, rating, url, created_at, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
    const values = [this.name, this.image_url, this.price, this.rating, this.url, this.created_at, location_id];

    client.query(SQL, values);
  }
}

function Movie(movie) {
  this.tableName = 'movie';
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.average_votes;
  this.total_votes = movie.total_votes;
  this.image_url = `http://image.tmdb.org/t/p/w185/${movie.poster_path}`;
  this.popularity = movie.popularity;
  this.released_on = movie.released_on;
  this.created_at = Date.now();
}

function Meetups(meetups) {
  this.link = meetups.link;
  this.name = meetups.name;
  this.host = meetups.group.name;
  this.creation_date = new Date(meetups.created).toString().slice(0,15);
}

function Trails(hiking) {
  this.trail_url = hiking.url;
  this.name = hiking.name;
  this.location = hiking.location;
  this.length = hiking.length;
  this.condition_date = hiking.conditionDate;
  this.condition_time = hiking.conditionDetails;
  this.conditions = hiking.conditionStatus;
  this.stars = hiking.starVotes;
  this.star_votes = hiking.star_votes;
  this.summary = hiking.summary;
}

// Helper Functions
// Checks to see if there is DB data for a given location
function lookup(options) {
  const SQL = `SELECT * FROM ${options.tableName} WHERE location_id=$1;`;
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        options.cacheHit(result);
      } else {
        options.cacheMiss();
      }
    })
    .catch(error => handleError(error));
}

// Clear the DB data for a location if it is stale
function deleteByLocationId(table, city) {
  const SQL = `DELETE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}
 // Location handler
function getLocation(request, response) {
  Location.lookupLocation({
    tableName: Location.tableName,

    query: request.query.data,

    cacheHit: function (result) {
        console.log(result.rows[0]);
      response.send(result.rows[0]);
    },

    cacheMiss: function () {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GEOCODE_API_KEY}`;

      return superagent.get(url)
        .then(result => {
          const location = new Location(this.query, result);
          location.save()
            .then(location => response.send(location));
        })
        .catch(error => handleError(error));
    }
  })
}

// Weather handler
function getWeather(request, response) {
  Weather.lookup({
    tableName: Weather.tableName,

    location: request.query.data.id,

    cacheHit: function (result) {
      let ageOfResultsInMinutes = (Date.now() - result.rows[0].created_at) / (1000 * 60);
      if (ageOfResultsInMinutes > 30) {
        Weather.deleteByLocationId(Weather.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },

    cacheMiss: function () {
      const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

      return superagent.get(url)
        .then(result => {
          const weatherSummaries = result.body.daily.data.map(day => {
            const summary = new Weather(day);
            summary.save(request.query.data.id);
            return summary;
          });
          response.send(weatherSummaries);
        })
        .catch(error => handleError(error, response));
    }
  })
}

// Yelp handler
function getRestaurant(request, response) { 
  Yelp.lookup({
    tableName: Yelp.tableName,

    location: request.query.data.id,

    cacheHit: function (result) {
      let ageOfResultsInMinutes = (Date.now() - result.rows[0].created_at) / (1000 * 60);
      if (ageOfResultsInMinutes > 30) {
        Yelp.deleteByLocationId(Yelp.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
  },

  cacheMiss: function () {
    const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;

    return superagent.get(url)
                    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
                    .then((yelp_API_response) =>  {
        const yelpSummaries = yelp_API_response.body.businesses.map(restaurant => {
          const summary = new Yelp(restaurant);
          summary.save(request.query.data.id);
          return summary;
        });
        response.send(yelpSummaries);
      })
        .catch(error => handleError(error, response));
    }
  })
}
 
function getMovies(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?query=${request.query.data.search_query}&api_key=${process.env.MOVIEDB_API_KEY}`;
	superagent.get(url)
	          .then(result => {
		          const movieSummaries = result.body.results.map(movie => {
			          return new Movie(movie);
              });
              // console.log('see movies', result);
	            response.send(movieSummaries);
	          })
	          .catch(error => handleError(error, response));
}

function getMeetups(request, response) {
  const url = `https://api.meetup.com/find/upcoming_events?&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}&key=${process.env.MEETUPS_API_KEY}`;
  superagent.get(url)
            .then(result => {
              // console.log(result.body);
              const meetupsSummaries = result.body.events.map(meetups => {
                // console.log('IN MAP!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
                return new Meetups(meetups);
              });
              // console.log('see meetups', meetupsSummaries);
              response.send(meetupsSummaries);
            })
            .catch(error => handleError(error, response));
}

function getTrails(request, response) {
  const url = `https://hikingproject.com/data/get-trails?&lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&key=${process.env.TRAILS_API_KEY}`;
  // console.log('this is the url');
  superagent.get(url)
            .then(result => {
              // console.log(result.body);
              const trailsSummaries = result.body.trails.map(hiking => {
                // console.log('here are the trails');
                return new Trails(hiking);
              });
              // console.log('more hikes', trailsSummaries);
              response.send(trailsSummaries);
            })
            .catch(error => handleError(error, response));
}