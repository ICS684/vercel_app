'use client';

import { useState } from 'react';
import { Col, Container, Row, ButtonGroup, Button } from 'react-bootstrap';
import USMap from '../components/USMap';
import BubbleMap from '../components/BubbleMap';

const Home = () => {
  const [mapType, setMapType] = useState<'choropleth' | 'bubble'>('choropleth');

  return (
    <main>
      <Container id="landing-page" fluid className="py-3">
        <Row className="text-center">
          <Col xs={12} className="d-flex flex-column align-items-center mt-5">
            <h1 className="mb-4">ZHVI Visualization</h1>

            <ButtonGroup className="mb-4">
              <Button
                variant={mapType === 'choropleth' ? 'primary' : 'outline-primary'}
                onClick={() => setMapType('choropleth')}
              >
                Choropleth
              </Button>

              <Button
                variant={mapType === 'bubble' ? 'primary' : 'outline-primary'}
                onClick={() => setMapType('bubble')}
              >
                Bubble Map
              </Button>
            </ButtonGroup>

            <div style={{ width: '100%', maxWidth: 900 }}>
              {mapType === 'choropleth' ? <USMap /> : <BubbleMap />}
            </div>
          </Col>
        </Row>
      </Container>
    </main>
  );
};

export default Home;
