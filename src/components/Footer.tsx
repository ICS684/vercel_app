import { Col, Container } from 'react-bootstrap';

/** The Footer appears at the bottom of every page. Rendered by the App Layout component. */
const Footer = () => (
  <footer className="mt-auto py-3 bg-light">
    <Container>
      <Col className="text-center">
        <h6>Team Lobron Jared</h6>
        Jared Lo - Anson Leung - Elijah Saloma
      </Col>
    </Container>
  </footer>
);

export default Footer;
