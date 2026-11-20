import torch
import torch.nn as nn
import torch.nn.functional as F


class MultVAE(nn.Module):
    """
    Multinomial Variational Autoencoder for Collaborative Filtering
    (Liang et al., WWW 2018).
    """

    def __init__(self, num_items: int, hidden_dim: int = 200, latent_dim: int = 64, dropout: float = 0.5):
        super().__init__()
        self.num_items = num_items
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim
        self.dropout = nn.Dropout(p=dropout)

        # Encoder
        self.enc_fc = nn.Linear(num_items, hidden_dim)
        self.mu_layer = nn.Linear(hidden_dim, latent_dim)
        self.logvar_layer = nn.Linear(hidden_dim, latent_dim)

        # Decoder
        self.dec_fc = nn.Linear(latent_dim, hidden_dim)
        self.out_layer = nn.Linear(hidden_dim, num_items)

        self._init_weights()

    def _init_weights(self):
        for layer in [self.enc_fc, self.mu_layer, self.logvar_layer, self.dec_fc, self.out_layer]:
            nn.init.xavier_uniform_(layer.weight)
            nn.init.zeros_(layer.bias)

    def encode(self, x: torch.Tensor):
        h = F.normalize(x, p=2, dim=1)
        h = self.dropout(h)
        h = torch.tanh(self.enc_fc(h))
        mu = self.mu_layer(h)
        logvar = torch.clamp(self.logvar_layer(h), min=-10.0, max=10.0)
        return mu, logvar

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor):
        if self.training:
            std = torch.exp(0.5 * logvar)
            eps = torch.randn_like(std)
            return mu + eps * std
        return mu

    def decode(self, z: torch.Tensor):
        h = torch.tanh(self.dec_fc(z))
        return self.out_layer(h)

    def forward(self, x: torch.Tensor):
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        logits = self.decode(z)
        return logits, mu, logvar


def multvae_elbo_loss(logits: torch.Tensor, x: torch.Tensor, mu: torch.Tensor, logvar: torch.Tensor, beta: float):
    """
    Negative ELBO = Multinomial Negative Log-Likelihood + beta * KL(q(z|x) || p(z))
    """
    log_softmax_var = F.log_softmax(logits, dim=1)
    recon_loss = -torch.mean(torch.sum(log_softmax_var * x, dim=1))
    kl_loss = -0.5 * torch.mean(torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1))
    return recon_loss + beta * kl_loss, recon_loss, kl_loss
